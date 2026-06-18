"""Storage backend factory."""
from __future__ import annotations

from functools import lru_cache

from ..config import get_settings
from .base import StorageBackend
from .local import LocalStorage


@lru_cache
def get_storage() -> StorageBackend:
    s = get_settings()
    if s.storage_backend == "adls":
        from .adls import ADLSStorage

        return ADLSStorage(
            originals_filesystem=s.adls_originals_filesystem,
            json_filesystem=s.adls_json_filesystem,
            connection_string=s.adls_connection_string,
            account_name=s.adls_account_name,
        )
    return LocalStorage(s.local_store_dir)
