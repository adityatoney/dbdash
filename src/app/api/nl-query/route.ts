import { NextRequest, NextResponse } from "next/server";
import { executeNLQuery } from "@/lib/nl-to-sql";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question = body?.question;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json(
        { error: "A non-empty 'question' field is required." },
        { status: 400 }
      );
    }

    const result = await executeNLQuery(question.trim());

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("NL-query error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
