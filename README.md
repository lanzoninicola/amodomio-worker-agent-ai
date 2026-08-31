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

As configuracoes operacionais ficam no contexto `whatsapp-ai-agent` da tabela
`settings` e podem ser editadas pela tela generica de configuracoes do Amodomio.

## Modos

- `test`: responde somente ao telefone definido em `testPhone`.
- `approval`: gera a resposta e salva o job como `generated`, sem enviar.
- `auto`: gera, envia pela Z-API e salva o job como `sent`.

Para o primeiro teste, configure `enabled=true`, `mode=test` e informe em
`testPhone` apenas os digitos do numero com DDI e DDD. O filtro e aplicado na
reserva SQL e conferido novamente antes do envio. Jobs de outros numeros
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
