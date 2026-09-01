# A Modo Mio - WhatsApp AI Worker

Worker Node persistente para processar a fila PostgreSQL criada pelo webhook do
Amomodio, gerar respostas pela OpenAI e, quando configurado em modo automatico,
enviar a resposta pela Z-API.

## Dokploy

Crie uma **Application** conectada a este repositorio GitHub:

- Build type: `Dockerfile`
- Dockerfile path: `Dockerfile`
- Docker context path: `.`
- Auto Deploy: habilitado na branch de producao
- Domain: nenhum

Copie as variaveis de `.env.example` para a aba **Environment** do Dokploy. O
container nao expoe porta e o healthcheck verifica o heartbeat do loop.

Configure `AMODOMIO_API_URL=https://www.amodomio.com.br` e use em
`AMODOMIO_API_KEY` o mesmo segredo configurado como
`VITE_REST_API_SECRET_KEY` no aplicativo principal. O worker consulta
`GET /api/ai/knowledge` com `x-api-key` e mantem o resultado em cache por um
minuto.

Respostas deterministicas são cadastradas no Amodomio e consultadas antes do
modelo. Saidas internas de classificadores de seguranca do OpenRouter sao
rejeitadas e nunca enviadas ao cliente.

As respostas podem usar `{{company.name}}`, `{{company.address}}`,
`{{company.city}}`, `{{company.state}}`, `{{company.phone}}`, `{{links.menu}}`
e `{{links.order}}`. O worker resolve esses placeholders usando a fonte oficial;
se algum valor estiver ausente, a regra não é enviada e a mensagem segue para a
AI.

As configuracoes operacionais ficam no contexto `whatsapp-ai-agent` da tabela
`settings` e podem ser editadas pela tela generica de configuracoes do Amodomio.

Para testar gratuitamente, use `provider=openrouter` e
`model=openrouter/free`. A chave fica somente em `OPENROUTER_API_KEY` no
Dokploy. OpenRouter e bloqueado fora do modo `test`. Ele recebe a mensagem
atual e somente o conhecimento empresarial relevante, sem telefone, nome,
identificadores ou historico da conversa.

## Modos

- `test`: responde somente aos telefones definidos em `testPhone`.
- `approval`: gera a resposta e salva o job como `generated`, sem enviar.
- `auto`: gera, envia pela Z-API e salva o job como `sent`.

Para o primeiro teste, configure `enabled=true`, `mode=test` e informe em
`testPhone` até dois números com DDI e DDD, separados por vírgula. O filtro é
aplicado na reserva SQL e conferido novamente antes do envio. Jobs de outros números
permanecem pendentes e nao sao processados.

Jobs que ultrapassam `maxJobAgeMinutes` sao marcados como `expired`, evitando
respostas atrasadas quando o modo mudar de `test` para `auto`.

O worker tambem usa o `updated_at` de `enabled`, `mode` e `testPhone` como inicio
da sessao atual. Ao trocar o modo, somente mensagens recebidas depois da troca
podem ser reservadas.

## Banco

O worker usa a tabela `whatsapp_agent_jobs`, criada pela migration existente no
repositorio principal `amodomio`. Os jobs sao reservados com
`FOR UPDATE SKIP LOCKED`; falhas usam backoff e jobs presos voltam a ficar
elegiveis depois do tempo de lock.

## Desenvolvimento

```bash
npm install
npm run build
npm test
```
