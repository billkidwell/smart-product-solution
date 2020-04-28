#!/bin/bash

echo "Generating certs for device: "$1

COMMON_NAME=$1
# Device Dir
DDIR=./devices/${COMMON_NAME}
CADIR=../certs

# Generate a private key
openssl genrsa -out ${DDIR}/deviceCert.key 2048

# Generate the csr
openssl req -new -config ${DDIR}/csr.cnf \
    -key ${DDIR}/deviceCert.key \
    -out ${DDIR}/deviceCert.csr

# Create the x509 certificate
openssl x509 -req -in ${DDIR}/deviceCert.csr \
    -CA ${CADIR}/sampleCACertificate.pem \
    -CAkey ${CADIR}/sampleCACertificate.key \
    -CAcreateserial \
    -out ${DDIR}/deviceCert.crt \
    -days 365 -sha256

# Create a certificate file
cat ${DDIR}/deviceCert.crt \
    ${CADIR}/sampleCACertificate.pem > ${DDIR}/deviceCertAndCACert.crt

# Create the certificate package
cp ${CADIR}/root.cert ${DDIR}/root.cert
cd ${DDIR}
tar czvf certs.tar.gz deviceCert.key \
    deviceCertAndCACert.crt \
    root.cert

rm root.cert