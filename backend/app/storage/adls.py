"""Azure Data Lake Storage Gen2 backend — two containers, dated paths.

  originals container (ADLS_ORIGINALS_FILESYSTEM)
    <YYYY>/<MM>/<DD>/<doc_id>/<filename>

  parsed-json container (ADLS_JSON_FILESYSTEM)
    <YYYY>/<MM>/<DD>/<doc_id>/<stem>.json     final JSON content
    records/<doc_id>.json                      metadata index

The dated ``<YYYY>/<MM>/<DD>/<doc_id>`` prefix is identical in both containers,
so each original maps one-to-one to its JSON.

Auth:
  1. ADLS_CONNECTION_STRING — explicit connection string
  2. ADLS_ACCOUNT_NAME only — DefaultAzureCredential (managed identity)
"""
from __future__ import annotations

import json
from typing import Any, Optional

from .base import StorageBackend


class ADLSStorage(StorageBackend):
    def __init__(
        self,
        *,
        originals_filesystem: str,
        json_filesystem: str,
        connection_string: str | None = None,
        account_name: str | None = None,
    ):
        from azure.storage.filedatalake import DataLakeServiceClient

        if connection_string:
            service = DataLakeServiceClient.from_connection_string(connection_string)
        elif account_name:
            from azure.identity import DefaultAzureCredential

            service = DataLakeServiceClient(
                account_url=f"https://{account_name}.dfs.core.windows.net",
                credential=DefaultAzureCredential(),
            )
        else:
            raise ValueError(
                "ADLS storage requires ADLS_CONNECTION_STRING or ADLS_ACCOUNT_NAME"
            )

        self._originals = self._ensure(service, originals_filesystem)
        self._json = self._ensure(service, json_filesystem)

    @staticmethod
    def _ensure(service: Any, name: str) -> Any:
        fs = service.get_file_system_client(name)
        try:
            fs.create_file_system()
        except Exception:
            pass  # already exists
        return fs

    # ---- low-level helpers ----
    @staticmethod
    def _upload(fs: Any, path: str, data: bytes) -> str:
        fs.get_file_client(path).upload_data(data, overwrite=True)
        return f"{fs.file_system_name}/{path}"

    @staticmethod
    def _download(fs: Any, path: str) -> Optional[bytes]:
        try:
            return fs.get_file_client(path).download_file().readall()
        except Exception:
            return None

    @staticmethod
    def _delete(fs: Any, path: str) -> None:
        try:
            fs.get_file_client(path).delete_file()
            return
        except Exception:
            pass
        try:
            fs.get_directory_client(path).delete_directory()
        except Exception:
            pass

    # ---- originals ----
    def save_original(self, path: str, data: bytes) -> str:
        return self._upload(self._originals, path, data)

    def read_original(self, path: str) -> bytes:
        data = self._download(self._originals, path)
        if data is None:
            raise FileNotFoundError(path)
        return data

    # ---- parsed-json content ----
    def save_json(self, path: str, payload: dict[str, Any]) -> str:
        return self._upload(
            self._json, path, json.dumps(payload, indent=2, default=str).encode("utf-8")
        )

    def read_json(self, path: str) -> Optional[dict[str, Any]]:
        data = self._download(self._json, path)
        return json.loads(data) if data else None

    # ---- records (index) ----
    def save_record(self, doc_id: str, record: dict[str, Any]) -> None:
        self._upload(
            self._json,
            f"records/{doc_id}.json",
            json.dumps(record, indent=2, default=str).encode("utf-8"),
        )

    def read_record(self, doc_id: str) -> Optional[dict[str, Any]]:
        data = self._download(self._json, f"records/{doc_id}.json")
        return json.loads(data) if data else None

    def list_records(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        try:
            for path in self._json.get_paths(path="records"):
                if getattr(path, "is_directory", False):
                    continue
                data = self._download(self._json, path.name)
                if data:
                    records.append(json.loads(data))
        except Exception:
            pass
        records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return records

    # ---- delete ----
    def delete_document(self, doc_id: str, prefix: str) -> None:
        self._delete(self._originals, prefix)
        self._delete(self._json, prefix)
        self._delete(self._json, f"records/{doc_id}.json")
