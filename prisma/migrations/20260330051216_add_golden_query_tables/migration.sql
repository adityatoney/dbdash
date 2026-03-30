-- CreateTable
CREATE TABLE "golden_queries" (
    "id" SERIAL NOT NULL,
    "sql" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'curated',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "golden_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "golden_query_patterns" (
    "id" SERIAL NOT NULL,
    "golden_query_id" INTEGER NOT NULL,
    "pattern" TEXT NOT NULL,
    "fingerprint" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "golden_query_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "golden_query_patterns_golden_query_id_idx" ON "golden_query_patterns"("golden_query_id");

-- AddForeignKey
ALTER TABLE "golden_query_patterns" ADD CONSTRAINT "golden_query_patterns_golden_query_id_fkey" FOREIGN KEY ("golden_query_id") REFERENCES "golden_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
