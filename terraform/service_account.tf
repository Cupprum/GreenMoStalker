resource "google_service_account" "account" {
  account_id   = "greenmo-service-account"
  display_name = "Greenmobility Stalker Account"
}

resource "google_project_iam_member" "project" {
  project = local.project
  role    = "roles/editor"
  member  = "serviceAccount:${google_service_account.account.email}"
}

resource "google_secret_manager_secret_iam_member" "secret_google_maps_api_token" {
  project   = local.project
  secret_id = google_secret_manager_secret.secret_google_maps_api_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.account.email}"
}

resource "google_secret_manager_secret_iam_member" "secret_pushover_api_token" {
  project   = local.project
  secret_id = google_secret_manager_secret.secret_pushover_api_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.account.email}"
}

resource "google_secret_manager_secret_iam_member" "secret_pushover_api_user" {
  project   = local.project
  secret_id = google_secret_manager_secret.secret_pushover_api_user.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.account.email}"
}