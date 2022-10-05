#!/usr/bin/env bash

echo -n "$GOOGLE_MAPS_API_TOKEN" | gcloud secrets create "GOOGLE_MAPS_API_TOKEN" --data-file=-
echo -n "$PUSHOVER_API_TOKEN" | gcloud secrets create "PUSHOVER_API_TOKEN" --data-file=-
echo -n "$PUSHOVER_API_USER" | gcloud secrets create "PUSHOVER_API_USER" --data-file=-

gcloud secrets add-iam-policy-binding "GOOGLE_MAPS_API_TOKEN" \
    --member="serviceAccount:${GREENMO_SERVICE_ACCOUNT}" \
    --project="${GREENMO_PROJECT_ID}" \
    --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding "PUSHOVER_API_TOKEN" \
    --member="serviceAccount:${GREENMO_SERVICE_ACCOUNT}" \
    --project="${GREENMO_PROJECT_ID}" \
    --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding "PUSHOVER_API_USER" \
    --member="serviceAccount:${GREENMO_SERVICE_ACCOUNT}" \
    --project="${GREENMO_PROJECT_ID}" \
    --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding "${GREENMO_PROJECT_ID}" \
  --member="serviceAccount:${GREENMO_SERVICE_ACCOUNT}" \
  --role="roles/cloudfunctions.invoker"

gcloud functions deploy "greenmo-notifier-function" \
    --entry-point="GreenMoNotifier" \
    --gen2 \
    --memory="128Mi" \
    --no-allow-unauthenticated \
    --quiet \
    --region="europe-central2" \
    --runtime="nodejs16" \
    --service-account="${GREENMO_SERVICE_ACCOUNT}" \
    --set-secrets="GOOGLE_MAPS_API_TOKEN=GOOGLE_MAPS_API_TOKEN:latest,PUSHOVER_API_TOKEN=PUSHOVER_API_TOKEN:latest,PUSHOVER_API_USER=PUSHOVER_API_USER:latest" \
    --source="./dist" \
    --trigger-http

gcloud scheduler jobs create http "greenmo-notifier-trigger" \
  --http-method="POST" \
  --location="europe-central2" \
  --oidc-service-account-email="${GREENMO_SERVICE_ACCOUNT}" \
  --schedule="30 11,16 * * *" \
  --time-zone="Europe/Copenhagen" \
  --uri="https://greenmo-notifier-function-xqibbfpaza-lm.a.run.app/"