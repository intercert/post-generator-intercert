import { NextResponse } from 'next/server';
import {
  LAYOUT_HELP,
  LAYOUT_KINDS,
  LOGO_POSITIONS,
  MOTIFS,
  RADII,
  normalizeBrand,
  parseHex,
  type Brand
} from '@/lib/brand';
import {
  HttpError,
  PROVIDER_LABELS,
  anthropic,
  extractJsonObject,
  gemini,
  openai,
  parseProvider,
  providerOrder,
  readJsonBody,
  tryModels,
  withRetry,
  type ProviderId
} from '@/lib/ai-clients';

// A análise lê imagens, então pode demorar mais que a geração de texto
export const maxDuration = 120;

const MAX_IMAGES = 12;
const MAX_IMAGE_CHARS = 2_500_000;
const JPEG_PREFIX = 'data:image/jpeg;base64,';

interface LogoBox {
  imagem: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
}

interface Analysis {
  brand: Brand;
  logoBox: LogoBox | null;
  observacoes: string[];
}

const SYSTEM_PROMPT = `
Você é um diretor de arte que audita a identidade visual de uma empresa a partir de posts que ela já publicou nas redes sociais.
Sua tarefa é extrair o PADRÃO que se repete, para que outro sistema consiga criar novos posts idênticos em estilo.

Regras:
- Descreva apenas o que está visível. Não invente nome, perfil, site ou cores. Se algo não aparece, deixe "" ou escolha o valor mais provável e anote em "observacoes".
- Transcreva o nome da empresa exatamente como está escrito na logo.
- "sub_marcas" são só variações do NOME na logo (ex.: "InterCert ERP"). Rótulos de editoria ou tema escritos no topo do post (como "OMNICHANNEL") NÃO são sub-marcas.
- Use as cores medidas nos pixels (fornecidas pelo usuário) como base para os códigos hexadecimais; escolha, entre elas, o papel de cada uma.
- A logo será recortada da imagem que você indicar: prefira uma imagem em que a logo apareça inteira, grande e sobre fundo claro. Informe a caixa que a envolve em frações da imagem (0 a 1, a partir do canto superior esquerdo).
- FEED E STORY: cada imagem diz se é um post de feed (quadrado ou 4:5) ou um story (vertical 9:16, com o topo e o rodapé cobertos pela interface do app). Eles têm composições diferentes, então descreva cada padrão separadamente: "layouts" só com o que aparece nos posts de FEED e "layouts_story" só com o que aparece nos STORIES. Se não há nenhum story, devolva "layouts_story": []. Se só há stories, repita os mesmos layouts nos dois. Em "logo", "posicao_padrao" é a posição nos posts de feed e "posicao_story" a posição nos stories (igual à do feed se não houver stories).
- Em "layouts", liste TODOS os tipos que aparecem, mesmo que em poucas imagens; não escolha um só como "o padrão" se houver mais de um. Liste só os que realmente aparecem. Tipos possíveis:
${LAYOUT_KINDS.map((k) => `  - "${k}": ${LAYOUT_HELP[k]}`).join('\n')}
  Em "quando", diga em que tipo de post a marca usa aquele layout.
- "estilo_imagem" deve ser um trecho em inglês, pronto para um gerador de imagens, com o TRATAMENTO visual que se repete em TODAS as imagens: tipo de fotografia, nível de realismo, luz, paleta e clima, e o tipo geral de pessoas e ambientes quando for comum a vários posts. NÃO descreva a cena de uma imagem específica (quem aparece, o que faz, em que lado fica) nem a composição de um post só: os temas mudam a cada post, então a cena tem de poder mudar. Não descreva texto nem logo.
- "observacoes": até 4 pontos que a pessoa deve conferir (ex.: logo cortada, nome ambíguo, cores parecidas).

MANUAL DE IDENTIDADE VISUAL: algumas imagens podem ser páginas de um manual (a legenda da imagem avisa). Quando houver manual:
- Ele é a fonte OFICIAL e vence os posts: use os códigos de cor, as fontes e as regras da logo que estão nele, mesmo que as cores medidas nos pixels sejam um pouco diferentes.
- A logo vem do MANUAL: em "logo.imagem" informe o número de uma PÁGINA DO MANUAL (nunca de um post), a que mostra a versão MATRIZ (principal, completa, sobre fundo claro), e em x, y, largura e altura a caixa só dessa logo, sem texto de unidade, de exemplo ou legendas. Só use um post se nenhuma página do manual mostrar a logo.
- Fontes do manual: se ele diz que Panton, Reitam ou outra fonte compõe o LOGOTIPO, isso vale só para a logo. Não as atribua à tipografia dos posts, a menos que o manual diga que valem para textos; em "tipografia", descreva a fonte dos títulos e textos dos posts como se vê neles.
- "paleta": todas as cores oficiais, uma por linha, no formato "Nome #RRGGBB (uso)". Se o manual mostrar só nomes ou outro formato, converta para hexadecimal quando o código aparecer.
- "manual": um resumo fiel, em português, do que o manual determina, em seções curtas com marcadores: LOGO (versões e quando usar cada uma, versão monocromática, nome da unidade), ÁREA DE RESPIRO E MARGENS, USOS PROIBIDOS, TIPOGRAFIA (nomes das fontes e onde cada uma é usada), CORES (nome, código e uso), ELEMENTOS GRÁFICOS (como o manual mostra o desenho de fundo e outros elementos). Só inclua o que está de fato no manual e ignore o resto. Se não houver manual, devolva "".

NÍVEL DE DETALHE (isto é o mais importante): outro sistema vai recriar posts novos SÓ a partir da sua descrição, então seja específico e quantitativo, com medidas em % da largura ou da altura do post.
- "logo.descricao": o símbolo (formas, quantidade, cores de cada parte), o nome ao lado (estilo da fonte, caixa alta/baixa, cor) e as variações para fundo claro e escuro.
- "motivo_detalhe": como o desenho de fundo aparece DE VERDADE: tamanho de cada forma (% da largura do post), opacidade aproximada (ex.: 3 a 8%, quase invisível), cor (tom sobre tom?), contorno ou preenchimento, quantas aparecem, em que cantos ou bordas ficam e se são cortadas pela borda. Se as formas são grandes e quase transparentes, diga isso; não descreva como pequenos enfeites. Diga também se NÃO existem pequenos grupos decorativos.
- Em cada layout, "descricao": a composição inteira, com posições e tamanhos aproximados: onde fica a foto e como é tratada (pessoa recortada ou foto cheia, lado, % da área), onde e como fica o título (linhas, tamanho relativo, cores e pesos de cada trecho, palavra-chave destacada), o card de texto (cor, cantos, posição, cor e peso do texto), a lista (ícones, cor, espaçamento), o rótulo superior, o fechamento e a logo (posição e tamanho). Escreva em um parágrafo corrido de 4 a 8 frases.
- "elementos": os pequenos elementos que se repetem nos posts (rótulo em caixa alta com linha, ícones de check, selos, setas, botões em pílula), cada um com forma e cor.

Retorne EXCLUSIVAMENTE um objeto JSON válido neste formato:
{
  "nome": "string",
  "sub_marcas": ["string"],
  "segmento": "o que a empresa faz, em uma frase, deduzido dos posts",
  "instagram": "@perfil ou vazio",
  "site": "site ou vazio",
  "logo": { "imagem": 1, "x": 0.0, "y": 0.0, "largura": 0.0, "altura": 0.0, "posicao_padrao": "${LOGO_POSITIONS.join('|')}", "posicao_story": "${LOGO_POSITIONS.join('|')}", "descricao": "string" },
  "paleta": "string (uma cor oficial por linha; vazio se não houver manual)",
  "manual": "string (resumo do manual; vazio se não houver manual)",
  "cores": { "primaria": "#RRGGBB", "destaque": "#RRGGBB", "fundo": "#RRGGBB (fundo claro predominante)", "texto": "#RRGGBB (texto principal sobre fundo claro)" },
  "motivo_grafico": "${MOTIFS.join('|')}",
  "motivo_detalhe": "string",
  "elementos": "string",
  "destaque_estilo": "caixa|texto  (caixa = a palavra-chave fica sobre um retângulo colorido; texto = só a cor e o negrito da própria fonte mudam, sem retângulo. Escolha o que mais se repete nos posts)",
  "raio": "${RADII.join('|')}",
  "caixa_apoio": "primaria|destaque  (cor das caixas com o texto de apoio)",
  "cta": "frase de fechamento que se repete, ou vazio",
  "layouts": [{ "tipo": "${LAYOUT_KINDS.join('|')}", "quando": "string", "descricao": "string" }],
  "layouts_story": [{ "tipo": "${LAYOUT_KINDS.join('|')}", "quando": "string", "descricao": "string" }],
  "tipografia": "descrição da fonte, pesos, caixa alta/baixa, alinhamento e hierarquia",
  "estilo_imagem": "string em inglês",
  "tom_de_voz": "como os textos falam com o público",
  "evitar": "o que a marca nunca faz nas imagens e nos textos",
  "observacoes": ["string"]
}
`;

function userText(count: number, colors: string[]): string {
  const measured = colors.length ? `Cores mais frequentes medidas nos pixels: ${colors.join(', ')}.` : '';
  return `Analise as ${count} imagens a seguir (Imagem 1 a Imagem ${count}), todas da mesma empresa: posts já publicados e, quando a legenda indicar, páginas do manual de identidade visual. ${measured} Retorne apenas o JSON puro.`;
}

type Images = { dataUrl: string; base64: string; label: string }[];

async function runOpenAI(images: Images, colors: string[]): Promise<string> {
  if (!openai) throw new Error('Chave da OpenAI não configurada.');
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText(images.length, colors) },
          ...images.flatMap((img) => [
            { type: 'text' as const, text: `${img.label}:` },
            { type: 'image_url' as const, image_url: { url: img.dataUrl, detail: 'high' as const } }
          ])
        ]
      }
    ]
  });
  return res.choices[0]?.message?.content ?? '';
}

async function runGemini(images: Images, colors: string[]): Promise<string> {
  if (!gemini) throw new Error('Chave do Gemini não configurada.');
  const client = gemini;
  const response = await tryModels(['gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite'], (model) =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: userText(images.length, colors) },
            ...images.flatMap((img) => [
              { text: `${img.label}:` },
              { inlineData: { mimeType: 'image/jpeg', data: img.base64 } }
            ])
          ]
        }
      ],
      config: { systemInstruction: SYSTEM_PROMPT, responseMimeType: 'application/json' }
    })
  );
  return response.text ?? '';
}

async function runClaude(images: Images, colors: string[]): Promise<string> {
  if (!anthropic) throw new Error('Chave do Claude não configurada.');
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 5000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: userText(images.length, colors) },
          ...images.flatMap((img) => [
            { type: 'text' as const, text: `${img.label}:` },
            {
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: img.base64 }
            }
          ])
        ]
      }
    ]
  });
  const block = res.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('Resposta do Claude sem texto.');
  return block.text;
}

const RUNNERS: Record<ProviderId, (images: Images, colors: string[]) => Promise<string>> = {
  openai: runOpenAI,
  gemini: runGemini,
  claude: runClaude
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const obj = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const fraction = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;

// Converte a resposta da IA (snake_case, livre) no perfil validado
function parseAnalysis(raw: string, imageCount: number): Analysis {
  const r = extractJsonObject(raw);
  if (!str(r.nome).trim()) throw new Error('A análise não identificou o nome da empresa.');

  const logo = obj(r.logo);
  const colors = obj(r.cores);

  const brand = normalizeBrand({
    nome: str(r.nome),
    subMarcas: Array.isArray(r.sub_marcas) ? r.sub_marcas.filter((s) => typeof s === 'string').join(', ') : '',
    segmento: str(r.segmento),
    instagram: str(r.instagram),
    site: str(r.site),
    logoPosicao: logo.posicao_padrao,
    logoDescricao: str(logo.descricao),
    motivoDetalhe: str(r.motivo_detalhe),
    elementos: str(r.elementos),
    paleta: str(r.paleta),
    manual: str(r.manual),
    corPrimaria: colors.primaria,
    corDestaque: colors.destaque,
    corFundo: colors.fundo,
    corTexto: colors.texto,
    motivo: r.motivo_grafico,
    destaqueEstilo: r.destaque_estilo,
    raio: r.raio,
    caixaApoio: r.caixa_apoio,
    cta: str(r.cta),
    layouts: r.layouts,
    layoutsStory: r.layouts_story,
    logoPosicaoStory: logo.posicao_story,
    tipografia: str(r.tipografia),
    estiloImagem: str(r.estilo_imagem),
    tomDeVoz: str(r.tom_de_voz),
    evitar: str(r.evitar)
  });

  const [x, y, largura, altura] = [logo.x, logo.y, logo.largura, logo.altura].map(fraction);
  const imagem = typeof logo.imagem === 'number' ? Math.round(logo.imagem) : 0;
  const logoBox =
    x !== null && y !== null && largura && altura && imagem >= 1 && imagem <= imageCount
      ? { imagem, x, y, largura: Math.min(largura, 1 - x), altura: Math.min(altura, 1 - y) }
      : null;

  const observacoes = Array.isArray(r.observacoes)
    ? r.observacoes
        .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
        .map((o) => o.trim().slice(0, 240))
        .slice(0, 4)
    : [];

  return { brand, logoBox, observacoes };
}

export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req);
    const provider = parseProvider(body.provider, 'claude');

    const rawImages = Array.isArray(body.imagens) ? body.imagens : [];
    if (rawImages.length === 0) throw new HttpError('Envie ao menos um post para analisar.', 400);
    if (rawImages.length > MAX_IMAGES) throw new HttpError(`Envie no máximo ${MAX_IMAGES} posts por análise.`, 400);

    // Cada imagem diz se é um post ou uma página de manual, para a IA dar a prioridade certa
    const origens: unknown[] = Array.isArray(body.origens) ? body.origens : [];
    const nomes: unknown[] = Array.isArray(body.nomes) ? body.nomes : [];
    const formatos: unknown[] = Array.isArray(body.formatos) ? body.formatos : [];

    const images: Images = rawImages.map((item, i) => {
      if (typeof item !== 'string' || !item.startsWith(JPEG_PREFIX) || item.length > MAX_IMAGE_CHARS) {
        throw new HttpError('Imagem inválida ou grande demais.', 400);
      }
      const nome = typeof nomes[i] === 'string' ? (nomes[i] as string).slice(0, 80) : '';
      const label =
        origens[i] === 'manual'
          ? `Imagem ${i + 1} (página do manual de identidade visual${nome ? `: ${nome}` : ''})`
          : formatos[i] === 'story'
            ? `Imagem ${i + 1} (STORY publicado, vertical 9:16)`
            : `Imagem ${i + 1} (post de FEED publicado)`;
      return { dataUrl: item, base64: item.slice(JPEG_PREFIX.length), label };
    });

    const colors = (Array.isArray(body.cores) ? body.cores : [])
      .map(parseHex)
      .filter((c): c is string => c !== null)
      .slice(0, 12);

    let analysis: Analysis | null = null;
    let usedProvider = '';

    for (const p of providerOrder(provider)) {
      try {
        const raw = await withRetry(() => RUNNERS[p](images, colors));
        console.log(`Análise bruta de ${p}:`, raw);
        analysis = parseAnalysis(raw, images.length);
        usedProvider = PROVIDER_LABELS[p];
        break;
      } catch (err) {
        console.warn(`Provedor ${p} falhou na análise ou devolveu JSON inválido. Tentando o próximo...`, err);
      }
    }

    if (!analysis) {
      throw new HttpError('Os modelos de IA não conseguiram analisar as imagens. Tente novamente em instantes.', 502);
    }

    return NextResponse.json({
      perfil: analysis.brand,
      logoBox: analysis.logoBox,
      observacoes: analysis.observacoes,
      usedProvider
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Erro na rota /api/analyze:', error);
    return NextResponse.json({ error: 'Erro interno no servidor.' }, { status: 500 });
  }
}
