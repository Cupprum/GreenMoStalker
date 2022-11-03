terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "4.40.0"
    }
  }
}

provider "google" {
  credentials = file("creds.json")

  project = "greenmobilitystalker"
  region  = "europe-central2"
  zone    = "europe-central2-a"
}

locals {
  project = "greenmobilitystalker"
}

resource "google_storage_bucket" "bucket" {
  name                        = "${local.project}-gcf-source"
  location                    = "europe-central2"
  uniform_bucket_level_access = true
}

resource "google_storage_bucket_object" "object" {
  name   = "function-source.zip"
  bucket = google_storage_bucket.bucket.name
  source = "../function-source.zip"
}

resource "google_cloudfunctions2_function" "function" {
  name     = "greenmo-stalker-function"
  location = "europe-central2"

  build_config {
    runtime     = "nodejs16"
    entry_point = "GreenMoNotifier"
    source {
      storage_source {
        bucket = google_storage_bucket.bucket.name
        object = google_storage_bucket_object.object.name
      }
    }
  }

  service_config {
    max_instance_count    = 1
    available_memory      = "128Mi"
    timeout_seconds       = 60
    service_account_email = google_service_account.account.email

    secret_environment_variables {
      key        = "GOOGLE_MAPS_API_TOKEN"
      project_id = local.project
      secret     = google_secret_manager_secret.secret_google_maps_api_token.secret_id
      version    = "latest"
    }
    secret_environment_variables {
      key        = "PUSHOVER_API_TOKEN"
      project_id = local.project
      secret     = google_secret_manager_secret.secret_pushover_api_token.secret_id
      version    = "latest"
    }
    secret_environment_variables {
      key        = "PUSHOVER_API_USER"
      project_id = local.project
      secret     = google_secret_manager_secret.secret_pushover_api_user.secret_id
      version    = "latest"
    }
  }
  depends_on = [
    google_secret_manager_secret_version.secret_google_maps_api_token,
    google_secret_manager_secret_version.secret_pushover_api_token,
    google_secret_manager_secret_version.secret_pushover_api_user
  ]
}