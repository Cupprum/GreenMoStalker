#!/usr/bin/env bash

tsc
cp package.json dist
cp package-lock.json dist

echo "$GOOGLE_MAPS_API_TOKEN" | gcloud secrets create "GOOGLE_MAPS_API_TOKEN" --data-file="-"
echo "$PUSHOVER_API_TOKEN" | gcloud secrets create "PUSHOVER_API_TOKEN" --data-file="-"
echo "$PUSHOVER_API_USER" | gcloud secrets create "PUSHOVER_API_USER" --data-file="-"

gcloud functions deploy testfunction \
    --gen2 \
    --region="europe-central2" \
    --runtime="nodejs16" \
    --source="./dist" \
    --entry-point="helloGET" \
    --memory="128Mi" \
    --set-secrets=["GOOGLE_MAPS_API_TOKEN=GOOGLE_MAPS_API_TOKEN","PUSHOVER_API_TOKEN=PUSHOVER_API_TOKEN","PUSHOVER_API_USER=PUSHOVER_API_USER"] \
    --trigger-http

