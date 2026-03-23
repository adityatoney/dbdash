import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { exec } from "child_process";
import { join } from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (
      !file.name.endsWith(".xlsx") &&
      !file.name.endsWith(".xls")
    ) {
      return NextResponse.json(
        { error: "Only .xlsx or .xls files are accepted" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filePath = join("/tmp", "uploaded.xlsx");

    await writeFile(filePath, buffer);

    const result = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        exec(
          `python3 etl/seed.py ${filePath}`,
          { cwd: process.cwd(), timeout: 300000 },
          (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve({ stdout, stderr });
            }
          }
        );
      }
    );

    return NextResponse.json({
      status: "success",
      message: "File uploaded and ETL process completed",
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    console.error("Upload error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error during upload";
    return NextResponse.json(
      { error: "ETL process failed", details: message },
      { status: 500 }
    );
  }
}
