"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!validTypes.includes(f.type) && !f.name.endsWith(".xlsx") && !f.name.endsWith(".xls")) {
      setStatus("error");
      setMessage("Please upload an Excel file (.xlsx or .xls).");
      return;
    }
    setFile(f);
    setStatus("idle");
    setMessage("");
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    },
    [handleFile]
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setStatus("uploading");
    setMessage("Uploading file...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${res.status}`);
      }

      const result = await res.json();
      setStatus("success");
      setMessage(result.message || "File uploaded and processed successfully.");
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload failed. Please try again.");
    }
  }, [file]);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Upload Data</h2>

      <Card>
        <CardHeader>
          <CardTitle>Upload Excel File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Drop Zone */}
          <div
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="mb-4 size-10 text-muted-foreground" />
            <p className="mb-2 text-sm font-medium">
              Drag and drop your Excel file here
            </p>
            <p className="mb-4 text-xs text-muted-foreground">
              or click to browse
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleInputChange}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>

          {/* Selected File Display */}
          {file && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <FileSpreadsheet className="size-5 text-green-600" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                onClick={handleUpload}
                disabled={status === "uploading"}
              >
                {status === "uploading" ? "Uploading..." : "Upload"}
              </Button>
            </div>
          )}

          {/* Status Message */}
          {message && (
            <div
              className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
                status === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : status === "error"
                  ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                  : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
              }`}
            >
              {status === "success" && <CheckCircle className="size-4" />}
              {status === "error" && <XCircle className="size-4" />}
              {message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
