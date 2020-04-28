# AWS Smart Product Solution Provisioner
## Provsioner for Simulated Devices

This project provides a way to provision simulated devices for the AWS smart-product-solution.

The project will create a DynamoDB entry and the appropriate certificates for the device.  The output will be stored locally.

### Steps to provision a device and generate certificates

1. Generate a UUID to serve as the serial number
2. Create a device directory (./devices/<uuid>)
4. Create a Certificate Signing Request

```
$ openssl genrsa -out deviceCert.key 2048
$ openssl req -new -key deviceCert.key -out deviceCert.csr
...
Common Name (e.g. server FQDN or Your name) []: <uuid>
$ openssl x509 -req -in deviceCert.csr -CA sampleCACertificate.pem -CAkey sampleCACertificate.key -CAcreateserial -out deviceCert.crt -days 365 -sha256
```

To do this with no prompts, try [this](https://www.switch.ch/pki/manage/request/csr-openssl/).

5. Create a certificate file
```
cat deviceCert.crt sampleCACertificate.pem > deviceCertAndCACert.crt
```

6. Copy the certs
```
cp deviceCert.key deviceCertAndCACert.crt root.cert ~/devices/<uuid>/certs
```

99. Update dynamodb with UUID, model number and device detail (currently hardcoded)
- Do this last, cause if anything else fails, we don't want crud in the db.