-- CreateTable
CREATE TABLE "healthcheck" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "healthcheck_pkey" PRIMARY KEY ("id")
);
