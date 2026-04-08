import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  getMunicipioPerfilAtivo,
  formatMunicipioPerfilForPrompt
} from "../services/municipioPerfil.service.js";
import {
  fetchIbgeContextoMunicipio,
  fetchMunicipiosPorUf
} from "../utils/ibgeMunicipio.js";
import {
  obterComparativoCompletoParaSync,
  montarTextoComparativoCompleto
} from "../services/comparativoMunicipio.service.js";

const router = Router();

/** Lista municipios da UF via API IBGE (para UI de selecao). */
router.get(
  "/ibge/municipios/:uf",
  requireAuth,
  requireRole("MASTER", "ADMIN"),
  async (req, res) => {
    try {
      const municipios = await fetchMunicipiosPorUf(req.params.uf);
      return res.json({ municipios });
    } catch (e) {
      return res.status(400).json({
        error: true,
        message: e.message || "Falha ao listar municipios",
        code: "IBGE_LISTA_UF"
      });
    }
  }
);

function parseDadosJson(input) {
  if (input == null) return {};
  if (typeof input === "object" && !Array.isArray(input)) return input;
  if (typeof input === "string") {
    try {
      const j = JSON.parse(input);
      return typeof j === "object" && j ? j : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Leitura: quem usa o assistente precisa ver se ha perfil. */
router.get(
  "/",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO", "VIGILANCIA"),
  async (_req, res) => {
    const perfil = await getMunicipioPerfilAtivo();
    const codigoEnv = process.env.MUNICIPIO_IBGE_CODIGO?.trim() || null;
    return res.json({
      perfil,
      municipioIbgeEnv: codigoEnv,
      promptPreview: perfil ? formatMunicipioPerfilForPrompt(perfil).slice(0, 500) : null
    });
  }
);

/** Edicao: apenas gestores. */
router.put(
  "/",
  requireAuth,
  requireRole("MASTER", "ADMIN"),
  async (req, res) => {
    const codigoIbge = String(req.body?.codigoIbge ?? "")
      .replace(/\D/g, "")
      .padStart(7, "0");
    if (codigoIbge.length !== 7) {
      return res.status(400).json({
        error: true,
        message: "Informe codigoIbge com 7 digitos",
        code: "MUNICIPIO_IBGE_INVALIDO"
      });
    }
    const nome = String(req.body?.nome ?? "").trim();
    const uf = String(req.body?.uf ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 2);
    if (!nome || uf.length !== 2) {
      return res.status(400).json({
        error: true,
        message: "Informe nome e UF do municipio",
        code: "MUNICIPIO_NOME_UF"
      });
    }
    const dadosJson = parseDadosJson(req.body?.dadosJson);
    const textoMunicipio =
      req.body?.textoMunicipio != null ? String(req.body.textoMunicipio) : null;

    const perfil = await prisma.municipioPerfil.upsert({
      where: { codigoIbge },
      create: {
        codigoIbge,
        nome,
        uf,
        dadosJson,
        textoMunicipio: textoMunicipio?.trim() || null
      },
      update: {
        nome,
        uf,
        dadosJson,
        textoMunicipio: textoMunicipio?.trim() || null
      }
    });

    return res.json({ success: true, perfil });
  }
);

/** Atualiza cache IBGE a partir do codigo informado (ou do corpo / env). */
router.post(
  "/sincronizar-ibge",
  requireAuth,
  requireRole("MASTER", "ADMIN"),
  async (req, res) => {
    let codigo = String(req.body?.codigoIbge ?? "").replace(/\D/g, "");
    if (!codigo) {
      codigo = String(process.env.MUNICIPIO_IBGE_CODIGO ?? "").replace(/\D/g, "");
    }
    if (!codigo) {
      const p = await getMunicipioPerfilAtivo();
      if (p) codigo = p.codigoIbge;
    }
    codigo = codigo.padStart(7, "0");
    if (codigo.length !== 7) {
      return res.status(400).json({
        error: true,
        message: "Informe codigoIbge ou configure MUNICIPIO_IBGE_CODIGO",
        code: "IBGE_CODIGO_AUSENTE"
      });
    }

    try {
      const ibgeCtx = await fetchIbgeContextoMunicipio(codigo);
      const loc = ibgeCtx.localidade || {};
      const comp = await obterComparativoCompletoParaSync({
        codigoIbge: codigo,
        nomeMunicipio: loc.nome,
        uf: loc.uf
      });
      ibgeCtx.comparativoCadRmaIbge = comp;
      ibgeCtx.textoContextoAssistente = montarTextoComparativoCompleto({
        textoTerritorialIbge: ibgeCtx.textoTerritorial,
        cadu: comp.cadu,
        bpc: comp.bpc,
        rmaCras: comp.rmaCras,
        rmaCreas: comp.rmaCreas,
        rmaPop: comp.rmaPop
      });
      const existente = await prisma.municipioPerfil.findUnique({
        where: { codigoIbge: codigo }
      });
      const agora = new Date();
      if (existente) {
        const atualizado = await prisma.municipioPerfil.update({
          where: { codigoIbge: codigo },
          data: {
            nome: loc.nome || existente.nome,
            uf: loc.uf || existente.uf,
            ibgeCacheJson: ibgeCtx,
            ibgeCacheEm: agora
          }
        });
        return res.json({ success: true, ibge: ibgeCtx, perfil: atualizado });
      }
      const criado = await prisma.municipioPerfil.create({
        data: {
          codigoIbge: codigo,
          nome: loc.nome || "Municipio",
          uf: loc.uf || "BR",
          dadosJson: {},
          ibgeCacheJson: ibgeCtx,
          ibgeCacheEm: agora
        }
      });
      return res.json({ success: true, ibge: ibgeCtx, perfil: criado });
    } catch (e) {
      console.error("sincronizar-ibge:", e);
      return res.status(502).json({
        error: true,
        message: e.message || "Falha ao consultar IBGE",
        code: "IBGE_UPSTREAM"
      });
    }
  }
);

export default router;
