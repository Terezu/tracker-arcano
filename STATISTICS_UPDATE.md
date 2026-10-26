# Estatísticas e confrontos — validação local

## Funcionalidades

- Campo opcional **Deck do oponente**, com texto livre e sugestões dos nomes de todo o histórico já carregado para estatísticas. Não há cadastro independente, vínculo com outro usuário ou limite de adversários diferentes.
- Registro, correção, limpeza do campo e exibição no histórico. Deck, versão e criação da partida continuam preservados nas correções.
- Na visão geral, selecionar um deck habilita **Deck adversário**, inicialmente em **Geral**. Trocar o deck reinicia o adversário e atualiza as opções exclusivamente desse deck.
- No time, membro e adversário são independentes e combinados por AND, juntamente com os filtros anteriores de deck e período. Limpar restaura o consolidado.
- Gráficos de pizza SVG sem novas dependências, tanto na distribuição geral quanto por mês. Preservam vitórias, derrotas e empates. Legendas e detalhes apresentam quantidades e percentuais. Mouse, toque e foco por teclado mostram os detalhes; outra fatia troca a seleção; botão **Fechar detalhes** e Escape fecham. Os detalhes ocupam espaço dentro do componente, evitando posicionamento fora da tela.

## Modelo, normalização e agregação

Única adição ao documento `usuarios/{uid}/partidas/{matchId}`: `deckAdversario?: string`, opcional, até 200 caracteres. Campo vazio é omitido na gravação. Documentos antigos continuam válidos sem qualquer alteração, com a opção **Sem deck adversário informado** nos filtros quando aplicável. Não há migração nem índices novos: os filtros reutilizam as leituras paginadas completas e o cache atuais.

`normalizeOpponent` centraliza remoção de espaços nas extremidades e compactação dos espaços internos. O nome exibido mantém a capitalização e os caracteres originais; a chave de comparação aplica Unicode NFKC e minúsculas. Pontuação e acentos não são removidos. A chave é derivada durante a leitura, sem campo redundante persistido; isso também agrupa nomes equivalentes já armazenados. Sugestões e opções exibem a primeira grafia encontrada por chave.

`filterMatches` aplica deck, adversário e período antes de calcular as estatísticas existentes. As partidas não são copiadas para documentos de confronto. `teamResults` mantém a deduplicação por `(uid, matchId)`, pois IDs iguais de membros diferentes representam registros distintos. A seleção de deck restringe os confrontos individuais; a seleção de membro restringe o consolidado coletivo. `resultSlices` usa o mesmo cálculo de resultados dos indicadores e inclui os empates no denominador. Nenhuma partida gera contadores persistidos adicionais.

As regras locais permitem somente o novo texto opcional e sua correção pelo titular. Autorização, membros ativos, limites de consulta, referências e demais campos imutáveis mantêm as regras anteriores. A chave normalizada é uma convenção de apresentação e cálculo, sem papel na autorização.

## Arquivos

- Criados: `src/components/ResultPie.tsx` e este relatório.
- Modelo e serviços: `src/types.ts`, `src/lib/domain.ts`, `src/services/matches.ts`, `firestore.rules`.
- Interface: `src/components/Matches.tsx`, `Overview.tsx`, `TeamStatistics.tsx`, `StatisticsView.tsx`, `Workspace.tsx`, `src/App.css`.
- Testes: `tests/domain.test.ts`, `tests/rules.test.mjs`, `tests/ui.test.mjs`.
- Documentação: `README.md`.

## Verificação

- `npm test`: 31 testes aprovados.
- `npm run test:rules`: 8 testes aprovados no emulador `demo-tracker-arcano`.
- `npm run test:ui`: 14 testes aprovados, incluindo interação real por toque via CDP, mouse, teclado, troca/limpeza de filtros, registro/correção, partidas antigas e layouts de 320 a 1440 px.
- `npm run lint`: aprovado.
- `npm run build`: aprovado, incluindo `tsc -b`.
- `git diff --check`: aprovado.

Uma execução da suíte de interface encontrou `EBUSY` ao ler o arquivo temporário `DevToolsActivePort` durante a inicialização do navegador. A repetição passou integralmente, sem alteração de código.

O Vite avisa que o bundle principal supera 500 kB; não impede a build. O npm também informa uma configuração ambiental `min-release-age` desconhecida. Não foram adicionadas dependências. As sugestões nativas de `datalist` dependem do navegador; a digitação livre permanece disponível. As estatísticas continuam lendo todo o histórico paginado, como antes; filtros locais não exigem releituras, mas o custo inicial cresce com o histórico.

## Validação manual e publicação futura

1. Em ambiente de desenvolvimento com Firebase de teste/emulador, registrar partidas com `Krenko`, ` krenko `, `Edgar  Markov` e sem adversário. Corrigir e limpar o adversário; conferir o histórico e a versão preservada.
2. Registrar confrontos de dois decks próprios contra o mesmo adversário. Alternar os decks na visão geral e conferir opções, reset para Geral e totais, incluindo registros antigos.
3. No time, combinar membro, adversário, deck e período; conferir a interseção e limpar os filtros.
4. Em smartphone/tablet físico, tocar em fatias, trocar a fatia selecionada e fechar os detalhes. Conferir também mouse, Tab e Escape no computador e as cores/legendas.

Os testes de interface usam adaptadores isolados, sem Firebase real. Para teste manual, não usar contas/dados de produção. A configuração padrão do aplicativo aponta para o projeto real, conforme o README.

Para uma publicação futura autorizada, as regras precisam aceitar `deckAdversario` antes de disponibilizar o novo cliente, pois as regras remotas anteriores rejeitam esse campo. Nenhum deploy, commit, migração ou alteração de dados remotos foi realizado nesta atualização.
