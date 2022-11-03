resource "google_secret_manager_secret" "secret_google_maps_api_token" {
  secret_id = "GOOGLE_MAPS_API_TOKEN"

  replication {
    user_managed {
      replicas {
        location = "europe-central2"
      }
    }
  }
}

resource "google_secret_manager_secret_version" "secret_google_maps_api_token" {
  secret = google_secret_manager_secret.secret_google_maps_api_token.name

  secret_data = var.GOOGLE_MAPS_API_TOKEN
  enabled     = true
}

resource "google_secret_manager_secret" "secret_pushover_api_token" {
  secret_id = "PUSHOVER_API_TOKEN"

  replication {
    user_managed {
      replicas {
        location = "europe-central2"
      }
    }
  }
}

resource "google_secret_manager_secret_version" "secret_pushover_api_token" {
  secret = google_secret_manager_secret.secret_pushover_api_token.name

  secret_data = var.PUSHOVER_API_TOKEN
  enabled     = true
}

resource "google_secret_manager_secret" "secret_pushover_api_user" {
  secret_id = "PUSHOVER_API_USER"

  replication {
    user_managed {
      replicas {
        location = "europe-central2"
      }
    }
  }
}

resource "google_secret_manager_secret_version" "secret_pushover_api_user" {
  secret = google_secret_manager_secret.secret_pushover_api_user.name

  secret_data = var.PUSHOVER_API_USER
  enabled     = true
}