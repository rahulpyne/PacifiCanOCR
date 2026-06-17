"""Azure Data Lake Storage Gen2 backend.

Stores, within one ADLS filesystem (container):

    <originals_prefix>/<doc_id>/<filename>   # original uploaded file
    <json_prefix>/<doc_id>/parsed.json        # final parsed JSON content
    records/<doc_id>.json                      # document metadata record

Auth is either a connection string (``ADLS_CONNECTION_STRING``) or, when only
``ADLS_ACCOUNT_NAME`` is set, ``DefaultAzureCredential`` (managed identity on
Azure App Service / Container Apps — the recommended production path).

This backend is import-light: the azure SDK is only imported when the backend
is actually constructed, so local dev never needs Azure configured.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from .base import StorageBackend


class ADLSStorage(StorageBackend):
    def __init__(
        self,
        *,
        filesystem: str,
        originals_prefix: str,
        json_prefix: str,
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

        self.fs = service.get_file_system_client(filesystem)
        try:
            self.fs.create_file_system()
        except Exception:
            pass  # already exists

        self.originals_prefix = originals_prefix.strip("/")
        self.json_prefix = json_prefix.strip("/")

    # ---- helpers ----
    def _upload(self, path: str, data: bytes) -> str:
        file_client = self.fs.get_file_client(path)
        file_client.upload_data(data, overwrite=True)
        return f"{self.fs.file_system_name}/{path}"

    def _download(self, path: str) -> Optional[bytes]:
        file_client = self.fs.get_file_client(path)
        try:
            return file_client.download_file().readall()
        except Exception:
            return None

    # ---- original files ----
    def save_original(self, doc_id: str, filename: str, data: bytes) -> str:
        return self._upload(f"{self.originals_prefix}/{doc_id}/{filename}", data)

    def read_original(self, doc_id: str, filename: str) -> bytes:
        data = self._download(f"{self.originals_prefix}/{doc_id}/{filename}")
        if data is None:
            raise FileNotFoundError(filename)
        return data

    # ---- metadata ----
    def save_record(self, doc_id: str, record: dict[str, Any]) -> None:
        self._upload(
            f"records/{doc_id}.json",
            json.dumps(record, indent=2, default=str).encode("utf-8"),
        )

    def read_record(self, doc_id: str) -> Optional[dict[str, Any]]:
        data = self._download(f"records/{doc_id}.json")
        return json.loads(data) if data else None

    def list_records(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for path in self.fs.get_paths(path="records"):
            if path.is_directory:
                continue
            data = self._download(path.name)
            if data:
                records.append(json.loads(data))
        records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return records

    def delete_record(self, doc_id: str) -> None:
        for path in (
            f"records/{doc_id}.json",
            f"{self.json_prefix}/{doc_id}",
            f"{self.originals_prefix}/{doc_id}",
        ):
            try:
                self.fs.get_file_client(path).delete_file()
            except Exception:
                try:
                    self.fs.get_directory_client(path).delete_directory()
                except Exception:
                    pass

    # ---- final JSON ----
    def save_json(self, doc_id: str, payload: dict[str, Any]) -> str:
        return self._upload(
            f"{self.json_prefix}/{doc_id}/parsed.json",
            json.dumps(payload, indent=2, default=str).encode("utf-8"),
        )

    def read_json(self, doc_id: str) -> Optional[dict[str, Any]]:
        data = self._download(f"{self.json_prefix}/{doc_id}/parsed.json")
        return json.loads(data) if data else None
