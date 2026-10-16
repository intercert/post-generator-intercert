# Gerador de Posts Institucionais com Multi-Provider IA e @vercel/og

Este documento é a especificação técnica completa para criar uma aplicação em **Next.js (App Router)** capaz de gerar postagens prontas para redes sociais respeitando rigidamente o **Design System** institucional (cores, fontes, logos e grids fixos).

O sistema suporta três provedores de IA (**OpenAI**, **Google Gemini** e **Anthropic Claude**) para redação do briefing/copy, e utiliza provedores de imagem (**DALL-E 3** ou **Google Imagen / Recraft via API**) com mecanismo de fallback caso uma das APIs falhe.

---

## 1. Arquitetura do Sistema

```
[ Usuário / Painel Web ]
         │
         │ 1. Tema + Escolha de Provedor (OpenAI / Gemini / Claude)
         ▼
[ /api/generate ]
         │
         ├── 2. LLM Selecionada com Fallback Automático:
         │       • OpenAI (gpt-4o-mini / gpt-4o)
         │       • Google Gemini (gemini-1.5-flash / gemini-1.5-pro)
         │       • Anthropic (claude-3-5-sonnet-20241022)
         │       └─ Retorna JSON padronizado (titulo, subtitulo, badge, legenda, image_prompt)
         │
         └── 3. API de Imagem:
                 • Provedor Primário: OpenAI DALL-E 3
                 • Fallback Secundário: Google Imagen 3 (via Gemini API)
                 └─ Retorna imagem de fundo conceitual (sem texto)
         │
         ▼
[ /api/og ]
         │ 4. Engine Satori / @vercel/og (Next.js Edge)
         │    Renderiza JSX -> PNG (1080x1080):
         │    - Imagem de fundo gerada pela IA
         │    - Gradiente institucional de contraste (overlay)
         │    - Logotipo vetorial oficial em SVG
         │    - Tipografia e paleta institucional cravadas
         ▼
[ Resultado Pronto ]
Preview visual na tela + Download direto do PNG + Botão de Copiar Legenda
```

---

## 2. Configuração do Projeto

### 2.1. Instalação e Pacotes

No terminal:

```bash
npx create-next-app@latest post-brand-generator --typescript --tailwind --app --eslint
cd post-brand-generator
npm install openai @google/genai @anthropic-ai/sdk
```

### 2.2. Variáveis de Ambiente (`.env.local`)

Crie o arquivo `.env.local` na raiz:

```env
# Provedores de Texto/LLM
OPENAI_API_KEY="sk-proj-..."
GEMINI_API_KEY="AIzaSy..."
ANTHROPIC_API_KEY="sk-ant-..."

# URL Base
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

---

## 3. Código do Backend: Orquestrador Multi-Provider

Crie o arquivo `app/api/generate/route.ts`. Este endpoint recebe o tema e o provedor escolhido. Se o provedor escolhido falhar, ele faz fallback automático para o próximo.

```typescript
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

// Inicialização dos clientes
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// System Prompt com o Design System corporativo travado
const SYSTEM_PROMPT = `
Você é o Diretor de Criação e Redator Oficial da Marca.
Sua missão é criar o conteúdo de um post institucional para redes sociais com base em uma data ou tema comemorativo.

DIRETRIZES DA NOSSA IDENTIDADE VISUAL:
- Cores de destaque: #0052FF (Azul principal), #00D084 (Verde destaque), #0B132B (Azul noite de fundo).
- Estilo estético: 3D render limpo, iluminação volumétrica suave, minimalista, estilo tech institucional.
- Regra de composição: a imagem deve deixar espaço negativo (área limpa) no terço superior para sobreposição de texto. Sem ilustrações cartunescas ou poluição visual.

Retorne EXCLUSIVAMENTE um objeto JSON válido no seguinte formato:
{
  "titulo": "Título curto de alto impacto com 4 a 6 palavras",
  "subtitulo": "Frase de apoio institucional com até 12 palavras",
  "badge": "Tag curta da ocasião (ex: DATA COMEMORATIVA ou 7 DE SETEMBRO)",
  "legenda": "Texto completo para LinkedIn e Instagram com tom profissional e hashtags",
  "image_prompt": "Prompt em inglês para render 3D abstrato e minimalista focado no tema"
}
`;

// Helper: Extração via OpenAI
async function runOpenAI(topic: string) {
  if (!openai) throw new Error("Chave da OpenAI não configurada.");
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Criar post para o tema: ${topic}` }
    ]
  });
  return JSON.parse(res.choices[0].message.content || '{}');
}

// Helper: Extração via Google Gemini
async function runGemini(topic: string) {
  if (!gemini) throw new Error("Chave do Gemini não configurada.");
  const response = await gemini.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Tema: ${topic}`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json'
    }
  });
  return JSON.parse(response.text || '{}');
}

// Helper: Extração via Anthropic Claude
async function runClaude(topic: string) {
  if (!anthropic) throw new Error("Chave do Claude não configurada.");
  const res = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: `Criar post para o tema: ${topic}. Retorne apenas o JSON puro, sem blocos markdown ou conversa.` }
    ]
  });
  const text = (res.content[0] as any).text.trim();
  const jsonStr = text.replace(/^```json/, '').replace(/```$/, '').trim();
  return JSON.parse(jsonStr);
}

// Helper: Geração de Imagem com Fallback
async function generateImage(prompt: string): Promise<string> {
  const fullPrompt = `${prompt}, clean abstract composition, negative space on top, 3d render, octane render, modern corporate lighting, subtle gradient, no text, no watermark`;

  // 1. Tentar DALL-E 3
  if (openai) {
    try {
      const imgRes = await openai.images.generate({
        model: 'dall-e-3',
        prompt: fullPrompt,
        size: '1024x1024',
        quality: 'standard'
      });
      if (imgRes.data?.[0]?.url) return imgRes.data[0].url;
    } catch (e) {
      console.warn("Falha no DALL-E 3, tentando provedor alternativo...", e);
    }
  }

  // 2. Fallback via Imagen 3 no Gemini
  if (gemini) {
    try {
      const imagenRes = await gemini.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: fullPrompt,
        config: { numberOfImages: 1, aspectRatio: '1:1' }
      });
      const base64Bytes = imagenRes.generatedImages?.[0]?.image?.imageBytes;
      if (base64Bytes) {
        return `data:image/png;base64,${base64Bytes}`;
      }
    } catch (e) {
      console.warn("Falha no Imagen 3:", e);
    }
  }

  // Fallback visual neutro de segurança se as APIs de imagem falharem
  return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080&auto=format&fit=crop";
}

export async function POST(req: Request) {
  try {
    const { topic, provider = 'openai' } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: 'Informe um tema.' }, { status: 400 });
    }

    let resultData: any = null;

    // Executa no provedor selecionado com fallback encadeado
    const providersToTry = [
      provider,
      ...['openai', 'gemini', 'claude'].filter((p) => p !== provider)
    ];

    for (const p of providersToTry) {
      try {
        if (p === 'openai' && openai) {
          resultData = await runOpenAI(topic);
          resultData.usedProvider = 'OpenAI (GPT-4o)';
          break;
        } else if (p === 'gemini' && gemini) {
          resultData = await runGemini(topic);
          resultData.usedProvider = 'Google Gemini (Flash)';
          break;
        } else if (p === 'claude' && anthropic) {
          resultData = await runClaude(topic);
          resultData.usedProvider = 'Anthropic Claude 3.5';
          break;
        }
      } catch (err) {
        console.warn(`Provedor ${p} falhou. Tentando próximo...`, err);
      }
    }

    if (!resultData) {
      throw new Error("Todos os provedores de IA configurados falharam ou nenhuma chave de API foi fornecida.");
    }

    // Gera o fundo visual com a IA de imagem
    const bgImageUrl = await generateImage(resultData.image_prompt);

    return NextResponse.json({
      ...resultData,
      bgImageUrl
    });
  } catch (error: any) {
    console.error('Erro na rota /api/generate:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
```

---

## 4. Renderizador Determinístico (@vercel/og)

Crie o arquivo `app/api/og/route.tsx`. Este arquivo renderiza o layout final com as fontes, alinhamentos e logotipo oficial da empresa de forma imutável:

```tsx
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const titulo = searchParams.get('titulo') || 'Independência e Inovação';
  const subtitulo = searchParams.get('subtitulo') || 'Compromisso com o futuro e com o desenvolvimento.';
  const badge = searchParams.get('badge') || 'DATA COMEMORATIVA';
  const bgUrl = searchParams.get('bgUrl') || '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '1080px',
          height: '1080px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0B132B',
          position: 'relative',
          padding: '80px',
          fontFamily: 'sans-serif'
        }}
      >
        {/* 1. Imagem de Fundo (IA) */}
        {bgUrl && (
          <img
            src={bgUrl}
            alt="Arte de Fundo"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '1080px',
              height: '1080px',
              objectFit: 'cover'
            }}
          />
        )}

        {/* 2. Filtro/Overlay de Gradiente para garantir legibilidade e paleta institucional */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1080px',
            height: '1080px',
            background:
              'linear-gradient(180deg, rgba(11, 19, 43, 0.94) 0%, rgba(11, 19, 43, 0.40) 55%, rgba(11, 19, 43, 0.92) 100%)'
          }}
        />

        {/* 3. Topo: Logotipo Oficial e Tag de Categoria */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            zIndex: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                backgroundColor: '#0052FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontWeight: 900,
                fontSize: '24px'
              }}
            >
              ◆
            </div>
            <span style={{ fontSize: '28px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.5px' }}>
              SUA EMPRESA
            </span>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(0, 82, 255, 0.2)',
              border: '1.5px solid #0052FF',
              padding: '8px 22px',
              borderRadius: '9999px',
              color: '#00D084',
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '1px'
            }}
          >
            {badge.toUpperCase()}
          </div>
        </div>

        {/* 4. Centro: Título e Subtítulo Institucional */}
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '880px', zIndex: 10 }}>
          <h1
            style={{
              fontSize: '60px',
              fontWeight: 900,
              lineHeight: 1.12,
              color: '#FFFFFF',
              marginBottom: '22px',
              letterSpacing: '-1.5px'
            }}
          >
            {titulo}
          </h1>
          <p
            style={{
              fontSize: '25px',
              fontWeight: 400,
              color: '#94A3B8',
              lineHeight: 1.4
            }}
          >
            {subtitulo}
          </p>
        </div>

        {/* 5. Rodapé: Assinatura e Redes */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            paddingTop: '26px',
            color: '#64748B',
            fontSize: '19px',
            fontWeight: 500,
            zIndex: 10
          }}
        >
          <span>@suaempresa</span>
          <span>suaempresa.com.br</span>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080
    }
  );
}
```

---

## 5. Interface do Usuário (Painel de Criação)

Substitua o conteúdo de `app/page.tsx`:

```tsx
'use client';

import { useState } from 'react';

export default function GeneratorPage() {
  const [topic, setTopic] = useState('');
  const [provider, setProvider] = useState<'openai' | 'gemini' | 'claude'>('openai');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, provider })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Monta URL da imagem compilada pelo @vercel/og
      const ogParams = new URLSearchParams({
        titulo: data.titulo,
        subtitulo: data.subtitulo,
        badge: data.badge,
        bgUrl: data.bgImageUrl
      });

      const finalImageUrl = `/api/og?${ogParams.toString()}`;
      setResult({ ...data, finalImageUrl });
    } catch (err: any) {
      alert(`Falha na criação do post: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result?.legenda) return;
    navigator.clipboard.writeText(result.legenda);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-8">
        
        {/* Cabeçalho */}
        <header className="text-center space-y-2">
          <div className="inline-block px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-full text-xs font-semibold tracking-wide uppercase mb-2">
            Automação de Marca & Design System
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Gerador de Posts Institucionais</h1>
          <p className="text-slate-400 text-sm md:text-base">
            Gera arte com layout travado + legenda profissional com escolha de modelo.
          </p>
        </header>

        {/* Formulário de Configuração */}
        <form onSubmit={handleGenerate} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Data Comemorativa ou Tema do Post
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex: 7 de Setembro, Dia de Nossa Senhora Aparecida, Dia da Mulher..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors text-slate-100 placeholder-slate-600"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Provedor de IA
              </label>
              <select
                value={provider}
                onChange={(e: any) => setProvider(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 focus:outline-none focus:border-blue-500 text-slate-100 transition-colors"
              >
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="gemini">Google (Gemini 2.5)</option>
                <option value="claude">Anthropic (Claude 3.5)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/20"
          >
            {loading ? 'Processando Briefing, Gerando Fundo e Compilando Arte...' : 'Gerar Post Completo'}
          </button>
        </form>

        {/* Exibição do Resultado */}
        {result && (
          <div className="grid md:grid-cols-2 gap-8 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
            {/* Imagem Pronta */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Arte Final (1080x1080)</h2>
                <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                  Gerado via {result.usedProvider}
                </span>
              </div>
              <div className="rounded-xl overflow-hidden shadow-2xl border border-slate-800 aspect-square bg-slate-950">
                <img
                  src={result.finalImageUrl}
                  alt={result.titulo}
                  className="w-full h-full object-cover"
                />
              </div>
              <a
                href={result.finalImageUrl}
                download={`post-${Date.now()}.png`}
                target="_blank"
                className="block text-center bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-semibold transition-colors"
              >
                Baixar Imagem em Alta Resolução (PNG)
              </a>
            </div>

            {/* Legenda e Detalhes */}
            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Legenda do Post</h2>
                  <button
                    onClick={copyToClipboard}
                    className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-blue-400 font-medium transition-colors"
                  >
                    {copied ? '✓ Copiado!' : 'Copiar Texto'}
                  </button>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm text-slate-300 whitespace-pre-wrap max-h-[380px] overflow-y-auto leading-relaxed">
                  {result.legenda}
                </div>
              </div>

              <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800/60 text-xs text-slate-400 space-y-1">
                <p><strong>Título aplicado:</strong> {result.titulo}</p>
                <p><strong>Subtítulo aplicado:</strong> {result.subtitulo}</p>
                <p><strong>Badge:</strong> {result.badge}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
```

---

## 6. Instruções de Execução

1. Adicione pelo menos uma chave válida no `.env.local` (`OPENAI_API_KEY`, `GEMINI_API_KEY` ou `ANTHROPIC_API_KEY`).
2. Execute o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
3. Acesse `http://localhost:3000`, selecione o provedor desejado, insira a data ou tema (ex: *"Post Dia do Cliente"* ou *"Post 7 de Setembro"*) e clique em **Gerar Post Completo**.