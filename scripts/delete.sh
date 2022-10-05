#!/usr/bin/env bash

gcloud secrets delete "GOOGLE_MAPS_API_TOKEN" --quiet
gcloud secrets delete "PUSHOVER_API_TOKEN" --quiet
gcloud secrets delete "PUSHOVER_API_USER" --quiet

gcloud functions delete "greenmo-notifier-function" \
    --gen2 \
    --quiet

gcloud scheduler jobs delete "greenmo-notifier-trigger" \
    --location="europe-central2" \
    --quiet