#!/bin/bash
# Generate self-signed SSL certificate for SynthOps
# Run this script on your VPS before starting the containers

CERT_DIR="/opt/synthops/ssl"
DOMAIN="synthops.synthesis-it.co.uk"

mkdir -p $CERT_DIR

# Generate self-signed certificate valid for 10 years
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout $CERT_DIR/synthops.key \
    -out $CERT_DIR/synthops.crt \
    -subj "/C=GB/ST=England/L=London/O=Synthesis IT Ltd/CN=$DOMAIN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:192.168.121.81"

chmod 600 $CERT_DIR/synthops.key
chmod 644 $CERT_DIR/synthops.crt

echo "SSL certificates generated in $CERT_DIR"
echo "  - synthops.crt (certificate)"
echo "  - synthops.key (private key)"
