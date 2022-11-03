resource "google_cloud_scheduler_job" "job" {
  name      = "greenmo-stalker-scheduler-DTU"
  schedule  = "30 11,16 * * *"
  time_zone = "Europe/Copenhagen"

  http_target {
    http_method = "POST"
    uri         = google_cloudfunctions2_function.function.service_config[0].uri
    oidc_token {
      service_account_email = google_service_account.account.email
    }
  }
}