-- CreateTable
CREATE TABLE "MunicipioPerfil" (
    "id" TEXT NOT NULL,
    "codigoIbge" VARCHAR(7) NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" VARCHAR(2) NOT NULL,
    "dadosJson" JSONB NOT NULL DEFAULT '{}',
    "textoMunicipio" TEXT,
    "ibgeCacheJson" JSONB,
    "ibgeCacheEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MunicipioPerfil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MunicipioPerfil_codigoIbge_key" ON "MunicipioPerfil"("codigoIbge");
