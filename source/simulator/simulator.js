const awsIot = require('aws-iot-device-sdk');
const colors = require('colors');
const config = require('./config.js');
const moment = require('moment');
const uuid = require('uuid');

const appConfig = config.getAppConfig();

const thingName = appConfig.thingName;
const telemetryTopic = `${config.telemetryTopic}/${thingName}`;
const eventTopic = `${config.eventTopic}/${thingName}`;
const commandTopic = `smartproduct/commands/${thingName}`;
console.log(`Shadow Params : ${JSON.stringify(config.getShadowParams())}`)
const device = awsIot.thingShadow(config.getShadowParams());

const temperatureChange = appConfig.temperatureChange;
const publishInterval = appConfig.publishInterval;
const statusInterval = appConfig.statusInterval;

let powerStatus = 'OFF';    // OFF, AC, HEAT
let actualTemperature = 71.5;
let targetTemperature = 71.5;
let flag = false;
let clientToken;

// OFF
const randomTemperature = () => {
    let plusOrMinus = Math.random() < 0.5 ? -1 : 1;
    return Math.round(100 * (actualTemperature + temperatureChange * plusOrMinus)) / 100;
}

// HEAT
const increaseTemperature = () => {
    return Math.round(100 * (actualTemperature + temperatureChange)) / 100;
}

// AC
const decreaseTemperature = () => {
    return Math.round(100 * (actualTemperature - temperatureChange)) / 100;
}

// Get colored text
const getColoredText = (temperature, data) => {
    // targetTemperature - 10 > temperature: error
    // targetTemperature - 10 <= temperature < targetTemperature - 5: warning
    // targetTemperature + 5 < temperature <= targetTemperature + 10: warning
    // targetTemperature + 10 < temperature: error
    if (temperature > targetTemperature + 10) {
        publishEvent('error', 'Temperature is exceeding upper threshold', temperature);
        return data.red + ' (Danger: HOT)'.gray;
    } else if (temperature <= targetTemperature + 10 && temperature > targetTemperature + 5) {
        publishEvent('warning', 'Temperature is slightly exceeding upper threshold', temperature);
        return data.yellow + ' (Warning: WARM)'.gray;
    } else if (temperature >= targetTemperature - 10 && temperature < targetTemperature - 5) {
        publishEvent('warning', 'Temperature is slightly dropping under the threshold', temperature);
        return data.yellow + ' (Warning: CHILLY)'.gray;
    } else if (temperature < targetTemperature - 10) {
        publishEvent('error', 'Temperature is dropping under the threshold', temperature);
        return data.blue + ' (Danger: COLD)'.gray;
    } else {
        return data.cyan + ' (NICE)'.gray;
    }
}

// Publish event topic
const publishEvent = (type, message, value) => {
    let currentTime = moment();
    let event = {
        deviceId: thingName,
        messageId: uuid.v4(),
        message: message,
        details: {
            eventId: `event_${currentTime.valueOf()}`,
            sensorId: 'sensor-id',
            sensor: 'nice sensor',
            value: value,
        },
        timestamp: currentTime.valueOf(),
        type: type,
        sentAt: currentTime.format(),
    };

    device.publish(eventTopic, JSON.stringify(event));
    console.log('Event published '.gray + JSON.stringify(event) + ' to AWS IoT Event topic.'.gray);
}

// Run and publish telemetry topic
const run = () => {
    switch (powerStatus) {
        case 'OFF': {
            actualTemperature = randomTemperature();
            break;
        }
        case 'AC': {
            actualTemperature = decreaseTemperature();
            break;
        }
        case 'HEAT': {
            actualTemperature = increaseTemperature();
            break;
        }
    }

    let currentTime = moment();
    let message = JSON.stringify({
        createdAt: currentTime.format(),
        deviceId: thingName,
        actualTemperature: actualTemperature,
        targetTemperature: targetTemperature,
        sentAt: currentTime.format(),
        timestamp: currentTime.valueOf()
    });
    device.publish(telemetryTopic, message);
    console.log('Telemetry published '.gray + getColoredText(actualTemperature, message) + ' to AWS IoT Telemetry.'.gray);
}

// Report state
const reportState = () => {
    try {
        let stateObject = {
            state: {
                reported: {
                    powerStatus: powerStatus,
                    actualTemperature: actualTemperature,
                    targetTemperature: targetTemperature,
                }
            }
        };
        clientToken = device.update(thingName, stateObject);
        if (clientToken === null) {
            console.log('ERROR: Reporting state failed, operation still in progress'.red);
        }
    } catch (err) {
        console.log('ERROR: Unknown error reporting state.'.red);
    }
}

console.log('Connecting to AWS IoT...'.blue);

// Connect
device.on('connect', function () {
    console.log('Connected to AWS IoT.'.blue);
    device.register(thingName, {}, function () {
        let stateObject = {
            state: {
                desired: {
                    powerStatus: powerStatus,
                    actualTemperature: actualTemperature,
                    targetTemperature: targetTemperature,
                }
            }
        };
        clientToken = device.update(thingName, stateObject);
        if (clientToken === null) {
            console.log('ERROR: Reporting state failed, operation still in progress'.red);
        }
    });

    setInterval(run, publishInterval);
    setInterval(reportState, statusInterval);

    device.subscribe(commandTopic);
});

// Publish command
device.on('message', function (commandTopic, payload) {
    if (flag) {
        let message = JSON.parse(payload.toString());

        // Publish to the topic.
        let reason = 'success';
        let status = 'success';
        let body = JSON.stringify({
            commandId: message.commandId,
            deviceId: thingName,
            reason: reason,
            status: status,
        });
        try {
            device.publish(commandTopic, body);
            console.log('Published '.gray + JSON.stringify(body).yellow + 'to AWS IoT Command Topic.'.gray);
        } catch (err) {
            console.log('ERROR to publish command topic: '.red, err);
        } finally {
            flag = false;
        }
    }
});

// Get state
device.on('status', function (thingName, stat, clientToken, stateObject) {
    if (stateObject.state.reported === undefined) {
        console.log('Cannot find reported state.'.red);
    } else {
        console.log(
            'Reported current state: '.gray,
            JSON.stringify(stateObject.state.reported).gray
        );
    }
});

// Get delta, and change state
device.on('delta', function (thingName, stateObject) {
    let change = false;
    try {
        if (stateObject.state.powerStatus !== undefined
            && stateObject.state.powerStatus !== powerStatus) {
            console.log(`Reported powerStatus state different from remote state, current: ${powerStatus},
                 desired: ${stateObject.state.powerStatus}.`.green);

            powerStatus = stateObject.state.powerStatus;
            switch (powerStatus) {
                case 'OFF': {
                    console.log('The device is OFF.'.green);
                    break;
                }
                case 'AC': {
                    console.log('AC is ON.'.blue);
                    break;
                }
                case 'HEAT': {
                    console.log('HEAT is ON.'.red);
                    break;
                }
            }
            change = true;

            publishEvent('info', 'Power status is changed by user', powerStatus);
        }

        if (stateObject.state.targetTemperature !== undefined
            && parseFloat(stateObject.state.targetTemperature) !== targetTemperature) {
            console.log(`The target temperature different from remote state, current: ${targetTemperature},
                desired: ${stateObject.state.targetTemperature}.`.green);

            targetTemperature = parseFloat(stateObject.state.targetTemperature);
            change = true;

            publishEvent('info', 'Target temperature is changed by user', targetTemperature);
        }

        if (change) {
            flag = true;
        }
    } catch (err) {
        publishEvent('diagnostic', `An error occurred ${JSON.stringify(err)}`);
        console.log('ERROR to set shadow.'.red);
        console.log('Error:', err);
    }
});

