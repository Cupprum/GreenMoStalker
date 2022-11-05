resource "google_cloud_scheduler_job" "job_dtu" {
  name      = "greenmo-stalker-scheduler-DTU"
  schedule  = "30 11,16 * * 2,4,6,7"
  time_zone = "Europe/Copenhagen"

  http_target {
    http_method = "POST"
    uri         = google_cloudfunctions2_function.function.service_config[0].uri
    headers     = { "Content-Type" : "application/json" }
    body        = base64encode("{\"location\":\"DTU\"}")
    oidc_token {
      service_account_email = google_service_account.account.email
    }
  }
}

resource "google_cloud_scheduler_job" "job_lundto" {
  name      = "greenmo-stalker-scheduler-Lundto"
  schedule  = "0 11-21 * * 2,4,6,7"
  time_zone = "Europe/Copenhagen"

  http_target {
    http_method = "POST"
    uri         = google_cloudfunctions2_function.function.service_config[0].uri
    headers     = { "Content-Type" : "application/json" }
    body        = base64encode("{\"location\":\"Lundto\"}")
    oidc_token {
      service_account_email = google_service_account.account.email
    }
  }
}

resource "google_cloud_scheduler_job" "job_bagsvaerd" {
  name      = "greenmo-stalker-scheduler-Bagsvaerd"
  schedule  = "0,30 15-19 * * 1,5"
  time_zone = "Europe/Copenhagen"

  http_target {
    http_method = "POST"
    uri         = google_cloudfunctions2_function.function.service_config[0].uri
    headers     = { "Content-Type" : "application/json" }
    body        = base64encode("{\"location\":\"Bagsvaerd\"}")
    oidc_token {
      service_account_email = google_service_account.account.email
    }
  }
}