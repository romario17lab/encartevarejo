# Integrações: API v1 e perfis de importação

O EncarteVarejo se conecta a sistemas de gestão e estoque **somente quando o sistema oferece uma API capaz de chamar a nossa, ou exporta um arquivo compatível (CSV ou XLSX)**.
Não existe integração automática com qualquer sistema e não declaramos suporte oficial a nenhum fornecedor. A importação manual de planilha continua disponível sempre.

| Caminho | Quando usar | Quem configura |
|---|---|---|
| Planilha + perfil de importação | O sistema exporta CSV/XLSX (o caso mais comum) | Qualquer pessoa com permissão de editar produtos |
| API v1 com token | O sistema (ou um integrador) consegue fazer requisições HTTP | Administrador da conta cria o token; o desenvolvedor da integração usa |

---

## 1. API v1

### Autenticação

- Crie o token em **Mais › Integrações** (`/app/integracoes`). Somente administradores.
- O token tem o formato `evk_<prefixo>_<segredo>` e **aparece uma única vez**. Guardamos apenas o prefixo (para identificar na tela) e o hash SHA-256.
- Envie em todas as chamadas: `Authorization: Bearer evk_...`
- Cada token pertence a **uma conta**. A conta vem sempre do token, nunca do corpo ou da URL. Produto, loja ou id de outra conta é tratado como inexistente.
- Revogar o token na tela corta o acesso imediatamente. A tela mostra o último uso (atualizado no máximo uma vez por minuto).
- O cookie de sessão do aplicativo **não** vale na API v1.

Permissões (escopos), escolhidas na criação:

| Escopo | Permite |
|---|---|
| `products.read` | `GET /api/v1/products`, `GET /api/v1/stores` |
| `prices.write` | `PUT /api/v1/products/prices` |
| `products.write` | Dentro do `PUT` de preços, **cadastrar** produto desconhecido quando a linha traz dados completos |

### Limites

- **120 requisições por minuto por token** (configurável no servidor por `API_RATE_LIMIT`). Acima disso: `429` com `Retry-After: 60`.
- 30 tentativas com token inválido por minuto por IP.
- Até **1000 linhas** por chamada de preços; até 500 produtos por página na listagem.
- Conta suspensa: `403 account_suspended`. Conta somente leitura (assinatura encerrada ou inadimplente após a carência): escritas retornam `402 subscription_inactive`; leituras continuam.
- O contador de limite fica na memória de cada processo web (com várias instâncias, o limite efetivo é por instância).

### Erros

Sempre JSON: `{ "error": { "code": "...", "message": "mensagem em português", "details": ... } }`

| HTTP | code | Quando |
|---|---|---|
| 401 | `unauthenticated` | Sem token, token inválido ou revogado |
| 403 | `forbidden` | Token sem o escopo necessário |
| 403 | `account_suspended` | Conta suspensa |
| 402 | `subscription_inactive` | Conta somente leitura (escritas) |
| 404 | `not_found` | `storeId` que não é da conta |
| 422 | `validation` | Corpo inválido (ex.: `items` vazio ou com mais de 1000 linhas); `details` lista os campos |
| 429 | `rate_limited` | Limite por minuto |

Erros **por linha** no lote de preços não derrubam a chamada: a resposta é `200` com o resultado de cada linha.

### GET /api/v1/stores

Lojas da conta (para descobrir o `storeId`).

```bash
curl -s https://SEU_ENDERECO/api/v1/stores -H "Authorization: Bearer $EV_TOKEN"
```
```json
{ "stores": [ { "id": "sto_...", "name": "Mercado Exemplo Centro", "slug": "mercado-exemplo-centro" } ] }
```

### GET /api/v1/products

Parâmetros opcionais: `barcode`, `q` (busca no nome), `updatedSince` (ISO 8601), `storeId` (inclui `storePrice` daquela loja), `limit` (1–500, padrão 100), `cursor` (valor de `nextCursor`).
Somente produtos ativos (não arquivados). **O custo nunca é retornado.**

```bash
curl -s "https://SEU_ENDERECO/api/v1/products?barcode=7891000100103" -H "Authorization: Bearer $EV_TOKEN"
```
```json
{
  "products": [
    { "id": "prd_...", "name": "Arroz 5kg", "brand": null, "category": "Mercearia", "sizeLabel": "5kg", "unit": "pct",
      "barcode": "7891000100103", "regularCents": 2590, "promoCents": null, "updatedAt": "2026-10-11T12:00:00.000Z" }
  ],
  "nextCursor": null
}
```

### PUT /api/v1/products/prices

Atualiza preço normal e/ou promocional em lote. Corpo:

```json
{
  "storeId": "sto_... (opcional)",
  "items": [
    { "barcode": "7891000100103", "regularCents": 2490, "promoCents": 2190 },
    { "productId": "prd_...", "promoPrice": "7.90" },
    { "barcode": "7891000400401", "name": "Óleo de soja 900ml", "unit": "un", "regularPrice": "8.49" }
  ]
}
```

**Identificação do produto** (uma por linha): `barcode` (EAN/GTIN, 8 a 14 dígitos) ou `productId` (o `id` devolvido pelo `GET`). Não guardamos o código interno (SKU) do seu sistema: use o EAN ou guarde o `id` do produto no seu sistema depois do primeiro `GET`. Se o mesmo EAN estiver em dois produtos da conta, a linha volta como `ambiguous` (use `productId` ou resolva os duplicados no aplicativo).

**Regras de valor** (explícitas para não haver arredondamento):

| Campo | Tipo | Exemplo | Observação |
|---|---|---|---|
| `regularCents`, `promoCents` | inteiro (centavos) | `1290` = R$ 12,90 | Número com casas decimais é recusado |
| `regularPrice`, `promoPrice` | **texto** decimal | `"12.90"`, `"12,9"`, `"1290"` | Até 2 casas, ponto ou vírgula, **sem** separador de milhar. Número (`12.9`) é recusado |
| qualquer um acima | `null` | `"promoCents": null` | Apaga o preço (ex.: encerrar a promoção) |
| ausente | — | — | Não altera |

Informar `regularCents` e `regularPrice` na mesma linha é erro. Valor máximo: 100.000.000 centavos.

**Sem `storeId`**: altera o preço do catálogo (vale para todas as lojas sem preço próprio).
**Com `storeId`**: grava o preço específico daquela loja (filial); o catálogo não muda.

**Produto desconhecido**: a linha volta como `not_found` e **nada é criado**. Só cadastramos se o token tiver `products.write` **e** a linha trouxer `barcode`, `name` e `unit` válidos (unidades: `un`, `kg`, `g`, `100g`, `l`, `ml`, `pct`, `cx`, `dz`, `bdj`, `fardo`, `lata`, `garrafa`, `maco`, `par`, `m`, `m2`). Campos opcionais: `brand`, `category`, `sizeLabel`. Nenhum dado é inventado: o que não vier fica em branco no cadastro (sem foto, sem marca), e o aplicativo mostra o produto como incompleto.

**Idempotência**: enviar o mesmo lote de novo não muda nada (as linhas voltam como `unchanged`). Um produto criado por uma chamada é encontrado pelo EAN na próxima, sem duplicar. Uma linha por produto em cada lote (repetição no mesmo lote volta como `invalid`).

Exemplo com curl:

```bash
curl -s -X PUT https://SEU_ENDERECO/api/v1/products/prices \
  -H "Authorization: Bearer $EV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"barcode":"7891000100103","regularCents":2490,"promoPrice":"21.90"},{"barcode":"7899999999999","regularCents":100}]}'
```

Resposta:

```json
{
  "storeId": null,
  "summary": { "updated": 1, "unchanged": 0, "created": 0, "notFound": 1, "ambiguous": 0, "invalid": 0 },
  "results": [
    { "line": 1, "status": "updated", "productId": "prd_...", "barcode": "7891000100103", "regularCents": 2490, "promoCents": 2190 },
    { "line": 2, "status": "not_found", "barcode": "7899999999999", "message": "Código não encontrado nesta conta." }
  ]
}
```

`status` por linha: `updated`, `unchanged`, `created`, `not_found`, `ambiguous`, `invalid` (com `message`). Linhas atualizadas podem trazer `warnings` (preço zero, promoção maior que o preço normal) — o valor é gravado mesmo assim, como na atualização em massa do aplicativo.

**Efeito nas campanhas**: a API muda o catálogo (ou o preço da loja). Campanhas já criadas guardam o retrato dos preços; para usar o preço novo, atualize a campanha no editor — o que muda o conteúdo exige nova aprovação, como sempre.

**Auditoria**: cada chamada que altera algo gera uma entrada no Histórico da conta com o nome e o prefixo do token, contagens e os produtos alterados. Criação e revogação de tokens também ficam registradas.

---

## 2. Planilha e perfis de importação

A importação de planilha (**Produtos › Importar planilha**, `/app/produtos/importar`) aceita CSV (`;`, `,` ou tabulação; UTF-8 ou Latin-1) e XLSX, até 10 MB e 5000 linhas. A primeira linha deve ter os nomes das colunas.

**Perfil de importação** = mapeamento de colunas salvo (qual coluna é o nome, o EAN, o preço…) + regra para produtos que já existem (pular, atualizar ou criar outro).

1. Primeira vez: importe escolhendo as colunas. No fim, use **Salvar estas colunas como perfil**.
2. Nas semanas seguintes: em **Importar com perfil salvo**, escolha o perfil e o arquivo novo → **Importar agora**. É um passo só.
3. Se o arquivo não tiver alguma coluna do perfil (o sistema mudou o leiaute), nada é importado e a tela lista as colunas que faltam. Importe escolhendo as colunas e salve um perfil novo.

Regras que continuam valendo: célula vazia não apaga dado existente; produto existente é reconhecido pelo código de barras ou por nome + tamanho; valores aceitam `12,90`, `12.90` e `R$ 12,90`; linhas com erro são listadas e não importadas.

Os perfis ficam em `organizations.settings.importProfiles` (até 20 por conta). Endpoints (sessão do aplicativo):
`GET/POST /api/products/import/profiles`, `PATCH/DELETE /api/products/import/profiles/:id`, `POST /api/products/import/profiles/:id/run` (multipart `file`).

### Leiautes de exemplo (genéricos)

Os três leiautes abaixo aparecem como **exemplos** no passo de colunas. São formatos comuns de exportação, **não** representam suporte oficial a nenhum sistema ou fornecedor. Confira os nomes das colunas do seu arquivo antes de importar.

**Exemplo A — cadastro com preço de venda (CSV com `;`)**
```
EAN;Descricao;Unidade;Preco Venda;Preco Promocao
7891000100103;Arroz Tipo 1 5kg;pct;25,90;22,90
7891000200209;Feijao Carioca 1kg;pct;8,99;
```

**Exemplo B — cadastro completo com seção e marca** (o custo, se vier, fica privado e nunca aparece em peças ou na vitrine)
```
Cod Barras;Produto;Marca;Secao;Embalagem;Un;Preco;Oferta;Custo
7891000300305;Cafe Torrado 500g;Marca Exemplo;Mercearia;500g;pct;18,90;16,90;12,10
```

**Exemplo C — lista de preços da semana**
```
GTIN;Nome;Preco Por
7891000500507;Leite Integral 1L;4,99
```
Neste leiaute só há o preço "por"; produtos novos entram sem preço normal (não inventamos o "de").

---

## 3. O que não fazemos

- Não buscamos dados no seu sistema por conta própria (sem robôs, sem acesso ao banco do ERP).
- Não sincronizamos estoque nem quantidade.
- Não criamos produtos com dados presumidos: o que não vier na API ou na planilha fica em branco e aparece como pendência.
