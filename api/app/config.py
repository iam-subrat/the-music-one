from urllib.parse import quote, urlsplit, urlunsplit
from pydantic_settings import BaseSettings, SettingsConfigDict


def _encode_db_url(raw: str, driver: str) -> str:
    """Re-encode DATABASE_URL so special chars in password are percent-escaped.

    Splits on the *last* '@' to correctly handle '@' inside the password,
    then re-encodes the password with quote(safe='').
    """
    # Normalise driver
    base = raw.replace("+asyncpg", "").replace("+psycopg2", "")
    scheme, rest = base.split("://", 1)
    scheme = "postgresql" if scheme == "postgres" else scheme

    at = rest.rfind("@")
    credentials, hostpart = rest[:at], rest[at + 1 :]

    colon = credentials.find(":")
    user, password = credentials[:colon], credentials[colon + 1 :]

    encoded = f"{scheme}+{driver}://{user}:{quote(password, safe='')}@{hostpart}"
    return encoded


class Settings(BaseSettings):
    database_url: str
    supabase_url: str
    supabase_anon_key: str
    odesli_api_key: str = ""
    youtube_api_key: str = ""
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    allowed_origins: str = "http://localhost:5173"
    frontend_url: str = "http://localhost:5173"
    root_path: str = ""
    cookie_domain: str = ""
    cookie_samesite: str = "lax"

    @property
    def cookie_samesite_value(self) -> str:
        v = self.cookie_samesite.strip().lower()
        return v if v in ("strict", "lax", "none") else "lax"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def sync_database_url(self) -> str:
        return _encode_db_url(self.database_url, "psycopg2")

    @property
    def async_database_url(self) -> str:
        return _encode_db_url(self.database_url, "asyncpg")


settings = Settings()
