from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    enable_dev_reseed: bool = False
    enable_dev_auth: bool = False
    session_secret: str = "dev-session-secret-change-me"
    session_secure: bool = False
    session_max_age_seconds: int = 60 * 60 * 24 * 14
    google_client_id: str = ""
    google_client_secret: str = ""
    oauth_redirect_uri: str = "http://localhost:5173/api/v1/auth/google/callback"
    frontend_origin: str = "http://localhost:5173"
    seed_owner_email: str = "seed-owner@example.com"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id.strip() and self.google_client_secret.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
