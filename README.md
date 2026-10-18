# Tracker Arcano · Lontras Arcanas

Aplicativo de uso diário para decktracking Pauper, em React + TypeScript + Vite, com Firebase Authentication e Firestore. Interface em português, responsiva, azul-marinho e vermelho. A configuração original de `src/lib/firebase.ts` foi preservada. Não foram modificados contas, documentos ou regras remotos, e nenhum deploy foi executado.

## Executar

Requer Node 22.18+ (testado com Node 24) e Java 21+ para o Firestore Emulator (testado com Java 25).

```sh
npm ci
npm run dev
npm run build
npm run preview
npm run lint
npm test
npm run test:rules
npm run test:ui
```

O aplicativo normal se conecta ao projeto real `tracker-arcano`. Os testes de regras usam exclusivamente `demo-tracker-arcano` no Emulator, sem dados ou credenciais administrativas de produção. Na primeira execução, a CLI baixa o Emulator. Build estático em `dist`.

## Funcionalidades

As melhorias de confrontos, filtros combinados e gráficos de pizza estão documentadas em [Estatísticas e confrontos — validação local](STATISTICS_UPDATE.md), incluindo modelo compatível, arquivos alterados, testes e procedimentos manuais.

- Login, logout, recuperação por e-mail, nome de exibição e troca de senha com reautenticação pela senha atual.
- Membros autorizados pelo administrador, sem cadastro público. Tela com UID para facilitar a autorização da conta existente.
- Exigência de troca de senha temporária na interface, com navegação bloqueada até concluir.
- Vários decks, importação textual, cabeçalhos Mainboard/Sideboard e prefixo SB:, erros por linha, pré-visualização e imagens de múltiplas faces.
- Consulta Scryfall em lotes de até 75 identificadores, nomes ingleses completos exatos, legalities.pauper, tamanho da lista e limite combinado de cópias. Básicos e exceções Oracle de número ilimitado ou “up to” são reconhecidos. Correspondências parciais são rejeitadas; para múltiplas faces informe `Face A // Face B`.
- IDs permanentes, versões imutáveis e atualização atômica da versão atual por transação. Renomear, arquivar ou restaurar mantém partidas e listas anteriores. Não existe exclusão de decks ou versões.
- Registro dos oito placares, datas locais, correção de data/placar e exclusão de partida com confirmação. A correção preserva deck, versão e data original de criação. “Ver versão usada” abre a lista histórica.
- Estatísticas gerais e por deck, incluindo todas as versões e decks arquivados, filtros de período, jogos individuais, distribuição e evolução mensal com números e legendas. Sem dados fictícios nas contas reais.

## Autorizar a conta existente e adicionar integrantes

1. No console Firebase de **tracker-arcano**, abra Authentication → Users e copie o UID da conta existente. Não recrie a conta nem remova seu perfil em `usuarios/{uid}`.
2. No Firestore, crie **membros/{UID}** (o ID do documento é exatamente o UID) com os campos booleanos:

```json
{ "ativo": true, "senhaTemporaria": false }
```

Use `false` na conta existente cuja senha já é pessoal. Isso preserva sua conta e acesso depois de publicar as regras. Os documentos existentes em `usuarios/{uid}`, com `nome`, `criadoEm` e `atualizadoEm`, continuam compatíveis; alterações do perfil preservam outros campos existentes.

3. Para novos integrantes, o administrador cria a conta por Authentication → Add user, define uma senha temporária e cria `membros/{UID}` com `ativo: true` e `senhaTemporaria: true`. Entregue a senha por um canal privado. O frontend não recebe credenciais administrativas.
4. Saia e entre novamente após a autorização. Para revogar acesso, defina `ativo: false`. As regras negam novas operações imediatamente; dados já carregados em memória permanecem até sair/recarregar.
5. Para voltar a exigir troca na interface depois de uma redefinição administrativa, apague no console `usuarios/{UID}/preferencias/interface` e marque `senhaTemporaria: true`.

**Remover o cadastro da interface não impede criar contas pela API pública do Firebase Auth.** Uma conta criada dessa forma continua sem acesso aos dados, porque somente o administrador pode gravar `membros`. As regras proíbem criar ou editar membros pelo cliente. Membros ativos podem listar somente membros ativos em páginas limitadas. O administrador deve provisionar pelo console; não é necessário script ou Admin SDK para esta base.

## Troca temporária: limite de segurança no Spark

Authentication troca efetivamente a senha após reautenticação. Depois, a interface grava `senhaTrocadaNaInterface: true` em uma preferência privada. **Esse reconhecimento é editável pelo próprio cliente e não comprova a troca de senha.** As regras NÃO o usam para conceder acesso e NÃO comprovam a alteração da senha no Auth. Um membro autorizado pode contornar a exigência de interface usando a API diretamente. Não existe neste projeto backend confiável para atestar a troca; não se promete esse nível de enforcement no Spark.

Nenhuma senha é gravada no Firestore, localStorage, arquivos ou logs. Os inputs são limpos após sucesso. Se a senha mudar mas falhar a gravação da preferência, o administrador pode definir `senhaTemporaria: false` após verificar o caso; a senha anterior já não funcionará.

## Estrutura de dados e integridade

```text
membros/{uid}                             # administração; consulta limitada dos membros ativos
usuarios/{uid}                            # perfil compatível
  preferencias/interface                 # somente reconhecimento de UX
  decks/{deckId}                          # nome, atual, arquivado
    versoes/{versionId}                   # deckId, texto, validacao, criadoEm
  partidas/{matchId}                      # deckId, versaoId, data, placar, criadoEm
```

Cada versão guarda cartas resolvidas, quantidades, faces, resultado e horário da validação. Uma nova versão e seu ponteiro são salvos na mesma transação; as regras com `getAfter` exigem as duas gravações. As regras impedem modificar/apagar versões, apagar decks, apontar novamente para uma versão antiga, alterar referências de uma partida ou sua criação, e gravar partidas com versões inexistentes/decks alheios. Novas partidas exigem deck ativo e versão atual. Uma carta posteriormente banida gera erro na consulta atual, sem editar a validação original ou remover histórico.

Datas de partidas são strings `AAAA-MM-DD`, exibidas sem `new Date(data)` nem conversão para UTC. Regras aceitam somente datas de calendário válidas entre 1900 e 2100, incluindo validação de anos bissextos. Horários de criação/validação são ISO e fornecidos pelo cliente; não são carimbos de auditoria confiáveis.

## Leituras, cache e estatísticas

O histórico visível consulta 50 partidas por página. Os decks são consultados em páginas de 100. Na abertura da sessão, as estatísticas fazem uma varredura separada e completa em páginas de 50, armazenada **somente em memória por UID**. Elas nunca são calculadas somente a partir da página visível. Nenhuma consulta ocorre a cada renderização ou mudança de filtro. Criar/corrigir/excluir partidas atualiza o cache após a confirmação do Firestore e recalcula as estatísticas; não reconsulta todo o histórico. A atualização de telas relê os decks e a primeira página do histórico. Logout limpa o cache.

“Atualizar dados” faz uma nova varredura para refletir alterações feitas por outra sessão. Não há sincronização em tempo real nem resumos persistidos que possam ficar inconsistentes. A leitura inicial custa aproximadamente N partidas + uma página de histórico + os decks, além das leituras de autorização nas regras. Históricos grandes consomem mais leituras/memória; acompanhar as cotas Spark e considerar resumos confiáveis/paginação de agregados antes de escalar. Uma varredura em várias páginas não é um snapshot transacional se outra sessão estiver alterando dados simultaneamente; atualize após terminar as alterações.

Vitórias em partidas = vitórias / todas as partidas. Empates contam no denominador. Vitórias em jogos = jogos vencidos / (vencidos + perdidos). 0-0 conta como empate e não soma jogos. Divisão por zero retorna 0.

## Scryfall e limites da validação

O serviço mantém cache de cartas em memória com validade de 24 horas para pré-visualização. Salvar uma versão ou consultar legalidade atual força atualização. Requisições são serializadas com intervalo mínimo de 550 ms; HTTP 429 provoca pausa de pelo menos 30 segundos, respeitando Retry-After em segundos ou data HTTP, com no máximo três tentativas. Falhas de rede/HTTP e cartas não resolvidas impedem salvar uma versão válida. URLs de imagens vêm exclusivamente de `image_uris` ou das faces; imagens não são armazenadas no Storage nem recortadas. O navegador mantém seu User-Agent e envia Accept: application/json.

### Correção de cartas multifaceadas

A reprodução real com `Tithing Blade // Consuming Sepulcher` identificou duas causas: `/cards/collection` resolveu a entrada pela face `Tithing Blade`, mas marcou as quatro variantes de nome completo como `not_found`; depois, o cliente rejeitava a face frontal por exigir igualdade textual somente com `card.name` completo. A carta é `transform`, com ID `dbaa9a2d-e9fd-4746-a26c-f99ae731f024` e Oracle ID `883a4180-9ede-4249-a4b8-3a29c998fb63`.

O serviço agora normaliza espaços e separadores `/` e `//` para comparar identidades e compartilhar o cache. A consulta exata inicial preserva a pontuação informada; nomes completos ainda não resolvidos têm uma segunda consulta pela primeira face. O resultado só é aceito se seu nome completo normalizado ou um nome oficial em `card_faces` corresponder exatamente à entrada e houver uma única identidade Oracle entre os candidatos. Não usa busca fuzzy nem correspondência por prefixo; um verso incorreto não é aceito por causa de uma frente correta. Sequências de três ou mais barras e separadores sem nomes não são corrigidos automaticamente. O nome persistido nas entradas e em `card.name` vem sempre do Scryfall, mantendo IDs, quantidades, principal e sideboard. As variantes da mesma carta são contabilizadas conjuntamente pelo Oracle ID, sem duplicar cópias por face.

Os layouts `transform`, `modal_dfc`, `split`, `adventure` e `flip` compartilham essa resolução por dados oficiais das faces. A apresentação mantém a imagem principal quando disponível e usa as imagens individuais quando necessário; texto Oracle também pode vir das faces. Não presume duas imagens para todo layout. A legalidade no Pauper continua obrigatória: resolver uma carta modal ou flip não a torna legal nesse formato. Outros layouts com a mesma estrutura são tratados genericamente; objetos sem os identificadores/dados obrigatórios continuam rejeitados.

Arquivos da correção: `src/services/scryfall.ts`, `tests/scryfall.test.ts`, novo fixture `tests/fixtures/scryfall-multiface.ts` e este README. Serviços de gravação, regras Firebase, estatísticas e Marcador de Vida não foram modificados. Versões antigas continuam imutáveis; a correção é aplicada a novas validações, sem reescrever listas já salvas.

Validação: as cinco entradas (`Tithing Blade`, `Tithing Blade // Consuming Sepulcher`, `Tithing Blade / Consuming Sepulcher`, `Tithing Blade//Consuming Sepulcher`, `Tithing Blade/Consuming Sepulcher`) foram reconhecidas nos testes com respostas representativas e também pelo serviço corrigido contra a API real, retornando o mesmo nome canônico, os mesmos IDs, quatro cópias, duas imagens e nenhum erro na lista testada. Build, lint, 26 testes de domínio/acesso/Scryfall, 13 testes de navegador e sete testes no emulador passaram, incluindo imutabilidade de versões. Os fixtures cobrem face única, os cinco layouts, pontuação, cache, erro de verso, resposta diferente da solicitada, nome inexistente, ambiguidade, limite conjunto de cópias e preservação de validações anteriores. A consulta real em Node exigiu um User-Agent identificado; no aplicativo, permanece o User-Agent normal do navegador. O build mantém o aviso existente de tamanho do bundle Firebase. Não foi realizado deploy nem alteração de produção.

**A validação é feita no navegador, não por servidor independente.** Membros podem enviar dados manualmente para sua própria conta. As regras validam estrutura, campos, limites, referências e imutabilidade, mas não consultam Scryfall, não iteram/verificam profundamente cada carta da lista e não atestam legalidade Pauper. Os gráficos também calculam dados no cliente. Esta base serve ao acompanhamento privado do time, não à certificação de decklists ou resultados de torneio. Há limite operacional de 200 linhas e 30.000 caracteres por lista, sem pretensão de definir tamanho máximo oficial de deck.

Referências oficiais consultadas em 05/10/2026:

- [Scryfall API e cabeçalhos](https://scryfall.com/docs/api)
- [Coleções de até 75 identificadores](https://scryfall.com/docs/api/cards/collection)
- [Limites atuais: collection 2/s, HTTP 429 e cache](https://scryfall.com/docs/api/rate-limits)
- [Formato Pauper: mínimo 60, sideboard até 15, cópias](https://magic.wizards.com/en/formats/pauper)
- [Regras abrangentes oficiais, incluindo exceções de texto](https://magic.wizards.com/en/rules)
- [Banimentos oficiais](https://magic.wizards.com/en/banned-restricted-list)

## Publicação manual no Firebase Hosting (Spark)

Nenhum comando abaixo foi executado para publicar. Prepare membros antes de aplicar regras, para não bloquear integrantes existentes. Revise e salve cópia das regras remotas atuais pelo console antes de substituí-las.

```sh
npm run build
npx firebase login
npx firebase use tracker-arcano
npx firebase deploy --only firestore:rules,firestore:indexes
npx firebase deploy --only hosting
```

Publique **firestore.rules** e **firestore.indexes.json**. O índice de partidas ordena `data DESC` e `__name__ DESC`; os campos grandes `validacao` e `texto` de versões não são indexados. Aguarde índices ficarem prontos. `firebase.json` publica `dist` com fallback SPA e cache dos assets; `.firebaserc` aponta para o projeto correto. Em Authentication → Settings, confira os domínios autorizados para Hosting e localhost e o modelo de recuperação por e-mail. Não habilite faturamento. Não usa Functions, App Hosting, Storage nem servidor obrigatório.

## Verificações e roteiro manual

Executados com sucesso: build, lint, 14 testes de domínio/acesso/Scryfall, sete testes no Firestore Emulator e nove testes da interface/responsividade no Chrome headless (teste principal e oito subtestes). O teste de interface compila os componentes reais com serviços isolados de teste, sem conexão com o Firebase real, e cobre cadastro obrigatório, validação, erros de leitura/gravação/confirmação, preservação da exigência de senha temporária e expansão/recolhimento por clique e teclado. Os testes de regras cobrem contas distintas, não membros, criação indevida de membros, consultas limitadas, campos/placares/datas, referências, versões imutáveis, gravação atômica e preservação de histórico/perfil/autorização após cadastrar o nome. Autenticação real, entrega de e-mails, avaliação visual em dispositivos reais e deploy remoto exigem validação manual. Build pode emitir aviso de tamanho do bundle do SDK Firebase; não impede a compilação.

`npm run test:ui` usa Chrome ou Edge headless já instalado no Windows, sem dependências adicionais. Em outros ambientes, defina `TEST_BROWSER_PATH` com o caminho do navegador Chromium. Sem navegador disponível, o teste é marcado como ignorado. Os fixtures existem somente na compilação isolada do teste e não entram no build de produção.

`npm audit --omit=dev` terminou sem vulnerabilidades. Um override pontual atualiza `@grpc/grpc-js` usado pela distribuição Node do Firestore para uma versão corrigida, preservando a dependência Firebase existente. A auditoria da árvore completa ainda aponta 12 alertas nas ferramentas de desenvolvimento (5 moderados, 7 altos), que não são distribuídas no Hosting. Não foi aplicado `npm audit fix --force`, que propõe mudanças incompatíveis. Reavalie essas ferramentas antes de adotá-las em ambientes de CI sensíveis.

1. Autorize a conta existente, publique regras/índices manualmente, entre e confira perfil. Teste senha errada, recuperação e logout.
2. Para um membro com senha temporária, confirme o bloqueio da navegação e troque a senha usando a atual. Reentre e confirme que a troca não é pedida novamente.
3. Crie um deck de teste real usando `60 Mountain` (legal, embora não competitivo). Confira imagem/quantidade. Teste linha inválida, menos de 60, sideboard de 16 e cinco cópias de uma carta não básica; não devem salvar.
4. Teste nomes ambíguos/incompletos e uma carta banida. Teste internet desligada; não deve salvar como válido. Para uma carta dupla, use o nome completo com `//`.
5. Registre os oito placares. Totais esperados: 8 partidas, 3 vitórias, 3 derrotas, 2 empates, 7 jogos vencidos e 7 perdidos; taxas 37,5% em partidas e 50% em jogos.
6. Salve nova versão com `61 Mountain`. Na partida antiga, “Ver versão usada” deve mostrar 60. Renomeie e arquive; estatísticas devem permanecer. Restaure para registrar outra partida.
7. Corrija data/placar, confirme e confira filtros/totais; exclua uma partida com confirmação e confira os novos totais. Verifique uma data próxima à meia-noite sem mudança do dia.
8. Entre com outra conta autorizada e confirme estado individual vazio e consulta do time sem escrita em dados de terceiros. Uma conta Auth sem membro deve mostrar acesso aguardando autorização. Teste no celular e navegue pelo teclado.

## Estatísticas do Time

A aba reutiliza `statistics`, `filterMatches` e `StatisticsView` para consolidado e membros. Consulta membros ativos em páginas de 100 e reaproveita consultas de perfil, decks e varredura completa/cache de partidas. Membros sem nome cadastrado recebem uma identificação explícita; membros sem partidas permanecem visíveis com zero. Erros bloqueiam totais parciais e permitem tentar novamente.

Os filtros de período são inclusivos. Selecionar um membro habilita seu filtro de deck; todos os membros considera todos os decks. Todas as versões e decks arquivados são incluídos, como na visão individual. Os mesmos filtros se aplicam ao consolidado e aos membros.

A unidade estatística é `usuarios/{uid}/partidas/{id}`. Duplicatas do mesmo UID/ID são eliminadas; IDs iguais em usuários diferentes permanecem distintos. O modelo não identifica eventos compartilhados: dois membros registrando o mesmo confronto produzem dois resultados individuais, como nas estatísticas existentes. Não se deduz identidade por data ou placar.

Taxas são recalculadas pela fórmula original sobre os registros elegíveis: vitórias / partidas (incluindo empates) e jogos vencidos / jogos disputados, sem média simples de percentuais. Nenhum resumo é persistido. O serviço e componente do time não têm operações de escrita. Atualizar dados limpa o cache e relê o time; reabrir a aba relê membros, perfis e decks, reutilizando partidas em cache. Não há atualização em tempo real, seguindo o mecanismo atual.

As regras locais acrescentam somente leitura entre membros ativos para perfil, decks e partidas e listagem limitada de membros ativos. Escrita continua exclusiva do titular; preferências e versões/listas de terceiros permanecem privadas. Não se permite listar a coleção de perfis. Nenhuma migração ou mudança de estrutura é necessária.

**Ativação manual:** revisar e publicar as regras locais antes de usar a aba no ambiente remoto. As regras anteriores retornam acesso negado. Nenhum deploy ou alteração de produção foi executado. Validar visualmente desktop/celular, membros com e sem dados, nomes repetidos, filtros e atualização após mudanças em outra sessão. A varredura paginada mantém a limitação atual de não ser snapshot transacional.

O consolidado tem o título **Estatísticas Gerais do Time**. **Estatísticas por Membro** usa `details`/`summary` nativos, inicia fechado, mostra o indicador de expansão do navegador e aceita clique, Enter e Espaço. O consolidado permanece visível e os filtros continuam valendo para ambas as áreas.

## Nome obrigatório no acesso

Após autenticar, o fluxo central verifica `membros/{uid}.ativo` antes de consultar o nome do perfil no servidor. Membros sem nome válido em `usuarios/{uid}.nome` veem somente **Complete seu perfil**, com cadastro e saída da conta. O Workspace e sua navegação não são montados enquanto o nome estiver pendente. Não se usa `displayName` do Auth como substituto.

O nome deve ser texto com 1 a 80 caracteres após remover espaços das extremidades. A mesma validação atende o cadastro obrigatório e a edição existente do perfil. **Salvar e continuar** reutiliza a gravação com merge no perfil do mesmo UID, preservando campos legados e a data original de criação. O acesso só é liberado depois de confirmar o valor por `getDocFromServer`; falha de leitura, escrita ou confirmação mantém o bloqueio e permite repetir a operação. Se ainda houver senha temporária pendente, essa etapa existente vem depois do nome e antes do Workspace.

Usuários com nome válido seguem normalmente; contas não autorizadas permanecem bloqueadas e não podem concluir cadastro. Nenhuma conta é criada, nenhum UID/vínculo muda e decks, versões, partidas e autorização permanecem intactos. Não foi consultado nem alterado nenhum cadastro de produção: a compatibilidade é verificada no login e nos testes isolados.

Não é necessária alteração adicional em `firestore.rules` para exigir o nome na aplicação: as regras existentes já permitem criar/atualizar o próprio perfil e impedem editar terceiros. O bloqueio do nome ocorre no fluxo central da aplicação, sem rotas alternativas para o Workspace. Essa condição de interface não acrescenta uma exigência de nome às chamadas diretas da API Firestore; a autorização de membros e as restrições de escrita continuam sendo impostas pelas regras atuais. A verificação e confirmação do nome exigem conexão com o servidor.

Para publicar posteriormente, execute manualmente `npm run build` e `npx firebase deploy --only hosting --project tracker-arcano`. Se as regras da primeira implementação de Estatísticas do Time ainda não foram publicadas, revise-as e execute manualmente `npx firebase deploy --only firestore:rules,firestore:indexes --project tracker-arcano` antes de liberar a aba. Nenhum desses comandos de deploy foi executado.

## Responsividade mobile

A revisão é somente de interface: não altera cálculos, serviços, dados, permissões ou regras do Firestore. Mantém cores, fontes, gráficos e funcionalidades, sem novas dependências ou abas. O desktop conserva os estilos e a navegação visível; a lista de abas pode quebrar em mais linhas caso cresça.

Até 800 px, o menu principal vira um botão expansível com indicação da aba atual, `aria-expanded` e `aria-controls`. Todas as abas e **Sair** permanecem disponíveis. Escolher uma aba fecha o menu e retorna o foco ao botão; Escape também fecha. O menu não depende de hover nem de rolagem horizontal. Trocar orientação preserva o acesso à navegação.

As grades usam colunas que podem encolher sem overflow, com uma coluna para indicadores até 360 px, duas no mobile e três no desktop. Gráficos, perfil e decks usam uma coluna até 800 px. Até 430 px, formulários e ações principais ficam empilhados; cabeçalhos podem quebrar linha. Nomes longos, cartas e mensagens respeitam o espaço disponível. O símbolo da marca mantém proporção e não encolhe; o identificador Pauper continua visível.

Controles mobile têm área mínima de 44 × 44 px CSS e campos com fonte de 16 px para evitar o zoom automático usual do Safari iOS. O histórico preserva a tabela e todas as ações com rolagem horizontal somente dentro de uma região focável e identificada para leitores de tela. As margens respeitam `safe-area-inset` e o viewport permite áreas seguras sem bloquear zoom. Não há altura fixa de formulário ou sobreposição que dependa do teclado virtual.

`npm run test:ui` valida **320, 375, 390, 430, 768, 1024 e 1440 px**, incluindo todas as abas, login, cadastro, erros, senha temporária, menus, formulários, conteúdo longo, oito resultados, gráficos, editor/listas de cartas e versões históricas. Verifica overflow global, posição dos elementos, áreas de toque, tamanho dos campos e rolagem localizada da tabela. Também alterna retrato/paisagem e testa um viewport CSS equivalente ao desktop com zoom de 200%. Os serviços são isolados e nenhum fixture é usado no aplicativo real.

Para gerar capturas opcionais, defina `TEST_SCREENSHOTS=1` antes de executar `npm run test:ui`. Os PNGs são gravados em `mobile-review.local`, ignorado pelo Git. Foram revisadas capturas de menu/visão geral/decks/partidas em 390 px e visão geral em 1440 px. Fontes externas são bloqueadas somente no teste para manter a execução isolada.

**Validação manual restante:** Safari em iPhone/iPad e Chrome em Android reais, teclado virtual, seletores nativos de data, zoom real do navegador e áreas seguras de dispositivos com recortes. O Chrome headless confirma o layout e as interações em viewports simulados, mas não substitui essas verificações dos sistemas móveis. Nenhum deploy foi realizado; esta revisão não requer publicar regras do Firestore.

## Marcador de Vida v1.0

A aba **Marcador de Vida** integra a navegação existente, inclusive o menu mobile, dentro do Workspace autorizado. Configura 2, 3 ou 4 jogadores, exatamente 20/30/40 vidas, nomes manuais/padrão ou nomes de membros consultados opcionalmente, deck próprio opcional e dez cores distintas. Ao aumentar a quantidade de jogadores, resolve cores repetidas com os jogadores antes ocultos. O limite de veneno começa em 10 e aceita 15 ou outro inteiro positivo. Falhas nas consultas de nomes não impedem iniciar com convidados; não cria usuários.

Durante a sessão: vida independente com +1/−1/+5/−5, inclusive negativa; veneno não negativo; rotação individual em 180°; alertas de possível eliminação; comandantes múltiplos, troca de controlador, dano e correções; histórico expansível com valores anteriores/novos, jogador, fonte e horário; desfazer global; D6 e moeda com `crypto.getRandomValues` e rejeição de amostras para evitar viés; tela cheia com tratamento de falhas e modo Focar marcador como alternativa. Alertas nunca encerram a partida. Não há refazer nesta versão.

Reinício rápido exige confirmação, mantém jogadores, nomes, cores, rotação, deck e comandantes, restaura a vida inicial e zera veneno, dano e histórico. Nova configuração também exige confirmação antes de remover a sessão. Encerrar exige confirmação e preserva o resumo local para consulta posterior.

### Análise e arquitetura

O frontend existente usa React 19, TypeScript e Vite, CSS próprio e Firebase Authentication/Firestore; não há biblioteca adicional de componentes ou roteamento. A navegação é o estado de abas de `Workspace.tsx`; o marcador reutiliza as classes de painel, formulário, botões e avisos. O acesso ao Workspace permanece subordinado a `App.tsx` e `lib/access.ts`, incluindo membro ativo, nome confirmado e senha temporária. Os serviços existentes `data`, `decks`, `matches` e `profile` continuam responsáveis pelos dados protegidos. O registro existente exige deck ativo, versão e placar válidos. O novo modo offline evita depender dessa verificação remota e nunca autoriza o Workspace.

Responsabilidades e arquivos da funcionalidade:

- `src/life/domain.ts`: tipos versionados e funções puras de configuração, contadores, comandante, alertas, rotação, reinício, desfazer, contraste e aleatoriedade.
- `src/life/storage.ts`: serialização, validação e leitura/gravação exclusivamente locais.
- `src/life/LifeCounter.tsx`: ciclo de sessão, salvamento, retomada, conectividade, tela cheia, confirmações e passagem opcional ao formulário existente.
- `src/life/Configuration.tsx`, `PlayerPanel.tsx`, `CommanderControls.tsx`, `History.tsx`, `Tools.tsx` e `life.css`: interfaces separadas e estilos responsivos.
- `src/services/memberNames.ts`: consulta opcional das associações de membros ativos e dos nomes de perfil, usando as permissões existentes; retorna somente nomes para a interface e não os mantém no cache offline.
- `src/offline.tsx`, `marcador.html`, `src/life/offline.ts`, `build/offline-plugin.ts`, `public/manifest.webmanifest` e `public/life-icon.svg`: entrada isolada, preparação, geração do Service Worker e manifesto PWA.
- Integrações em `src/components/Workspace.tsx`, `src/components/Matches.tsx`, `src/main.tsx`, `index.html`, `vite.config.ts`, `firebase.json` e `package.json`; cobertura em `tests/life.test.ts` e `tests/ui.test.mjs`.

As demais alterações que já estavam no workspace foram preservadas. O marcador não exige alterações em regras, coleções, estatísticas, UIDs ou lógica de decks.

### Persistência e comandante

A sessão usa `localStorage`, chave `tracker-arcano.life.v1`, com schema 1. A gravação é síncrona após cada operação; uma referência à última sessão evita perder cliques sucessivos antes de o React renderizar. Guarda configuração, nomes, cores, vida, veneno, comandantes, controlador, dano por comandante/jogador, orientação, identificação opcional do deck, histórico e pilha de desfazer. Não guarda credenciais, tokens ou perfis. A validação reconstrói o histórico e verifica os contadores e a pilha de desfazer antes de aceitar uma sessão. Dados corrompidos ou incompatíveis não são apagados automaticamente. Falhas de armazenamento exibem aviso e permitem tentar salvar novamente; os controles continuam em memória.

O uso de localStorage evita uma dependência adicional e permite concluir o salvamento de cada toque sem fila assíncrona. O histórico completo tem limite prático pela quota e pelo desempenho do dispositivo; não é truncado silenciosamente. Limpeza de dados, navegação privada ou políticas do navegador podem apagar a sessão. O armazenamento é compartilhado pelas abas da mesma origem; use uma aba de marcador por dispositivo, pois esta versão não coordena edições simultâneas entre abas.

Cada comandante possui um ID estável, proprietário e controlador. Novo dano **de combate** aumenta somente o total daquela fonte contra aquele jogador e desconta a mesma quantidade da vida em uma única operação, desfeita atomicamente. Correção define o total sem alterar vida. O limite de 21 é avaliado separadamente para cada comandante; dano de habilidades não deve ser lançado como combate. Trocar controlador mantém identidade e dano já causado.

### Offline e registro manual

O build tem uma segunda entrada `/marcador.html`, sem imports de Firebase ou serviços privados, verificada pelo plugin durante a compilação. O Service Worker guarda somente esse HTML, os arquivos estáticos essenciais alcançados pelas dependências da entrada, manifesto e ícones. Não guarda o HTML autenticado, o bundle exclusivo do Firebase, respostas remotas, dados de membros ou decks. Navegações da aplicação que falham sem rede retornam a entrada isolada. A sessão local permanece na mesma origem, podendo ser retomada por ambas as entradas.

A preparação exige conexão inicial, HTTPS ou localhost e suporte a Service Worker. O botão de preparação detecta falhas e possui timeout; o modo isolado também tenta preparar automaticamente quando aberto online. O cache é versionado pelo conteúdo do build. Atualizações aguardam fechar as abas anteriores, sem forçar recarga de uma partida; na ativação removem somente caches antigos do marcador e não mexem na sessão. Fontes externas podem usar o fallback local offline.

Após encerrar, usuários conectados no Workspace podem abrir **Partidas**, com o deck escolhido quando ainda elegível. Data e placar são preenchidos pelo usuário no formulário existente; o marcador não deduz vencedor. Salvar exige confirmação explícita. Offline ou na entrada isolada, mantém o resumo e explica como registrar depois, sem gravar no Firebase nem criar uma fila de resultados. Sessões, ferramentas e ajustes não enviam resultados nem alteram estatísticas.

### Validação executada e celular

Executados em 13/10/2026: build, lint, 23 testes de domínio/acesso/Scryfall (nove do marcador), sete testes de regras no Firestore Emulator e 12 testes de navegador (principal e 11 subtestes), sem testes ignorados. Os testes reais de navegador verificam sessão após recarga, sequência de cliques, comandante/correção/desfazer, confirmação antes de registro e ausência de gravação automática; layouts de 2/3/4 jogadores em 320, 375, 390, 430, 768 e 1024 pixels CSS em retrato/paisagem; cache do build real, recuperação e ferramentas offline com rede desabilitada e servidor bloqueado; confirmações de reinício e nova configuração. O build emite somente o aviso de tamanho do bundle principal do Firebase. Uma execução do Chrome falhou por restrições de GPU no sandbox; a reexecução fora desse ambiente passou.

Para validar localmente o build:

```bash
npm run build
npm run preview
```

Abra o endereço localhost mostrado pelo Vite e entre na aba, ou acesse `/marcador.html`. Prepare offline com internet, abra a entrada isolada, inicie uma sessão, altere contadores, recarregue e retome. Desative a rede, abra novamente o marcador, confira comandante, histórico, desfazer, dado e moeda; encerre sem registro e confirme que o resumo é preservado.

No celular, use um ambiente de teste HTTPS ou um túnel HTTPS configurado por você: HTTP pelo IP da rede local normalmente não habilita Service Worker. Abra `/marcador.html` online, prepare os arquivos e, se disponível, adicione à tela inicial. Teste com 2/3/4 jogadores nas duas orientações, rotação de cada painel, toques rápidos, modo avião, fechar/reabrir e retomar, confirmação de reinício, tela cheia e áreas seguras. Safari/iOS e Android reais, instalação PWA e Fullscreen API ainda precisam dessa validação manual; navegadores pequenos podem precisar de rolagem para ferramentas e alertas expandidos. Não foi realizada validação física nem publicação.

Para publicar **posteriormente**, após revisão, execute manualmente:

```bash
npm run build
npx firebase deploy --only hosting --project tracker-arcano
```

Nenhum deploy foi executado. O marcador não requer publicação de regras do Firestore.

## Ajustes para iPhone: orientação, modo imersivo e PWA

Novas partidas de dois jogadores começam com o Jogador 1 invertido em 180° quando o layout é vertical (até 800px em retrato); o Jogador 2 permanece normal. No layout de quatro jogadores, os dois painéis superiores começam invertidos; com três jogadores mantém-se a orientação normal. Desktop e dois jogadores em paisagem começam normais. Essa escolha acontece somente ao criar a partida, por `src/life/presentation.ts`, antes do salvamento. Trocar a orientação física não reaplica a rotação. Retomar uma sessão ou reiniciar preserva exatamente as escolhas salvas, inclusive sessões anteriores a esta atualização. A rotação manual continua disponível, e o conteúdo inteiro, com todas as áreas de toque, gira junto. O schema local permanece em 1, sem migração, exclusão ou mudança de contadores.

O botão **Tela cheia** aparece apenas quando `requestFullscreen` está disponível e `document.fullscreenEnabled` é verdadeiro, fora do modo standalone. Erros de solicitação ativam o modo imersivo e exibem uma explicação. Sem essa API, o usuário recebe **Modo imersivo**, com opção de sair. Esse modo ocupa o viewport da página, bloqueia a rolagem do conteúdo de fundo, reduz o cabeçalho e respeita as safe areas. Usa `100dvh` e mede o espaço restante após cabeçalhos e avisos, adaptando a altura dos painéis sem reduzir os controles abaixo de 44px. Ferramentas permanecem acessíveis abaixo dos painéis. Em alturas muito pequenas, quatro jogadores ou conteúdo extenso, a rolagem é mantida para não cortar controles. O modo imersivo não remove as barras do Safari.

No Safari do iPhone, fora de standalone, uma orientação expansível explica **Compartilhar → Adicionar à Tela de Início**, com botão para dispensar. O aviso não aparece quando `display-mode: standalone` ou `navigator.standalone` indica uma aplicação instalada. A detecção de suporte à tela cheia é independente da identificação do navegador.

Mantém-se um único manifesto, com o mesmo `id: /marcador.html`, `start_url: /marcador.html`, `scope: /` e `display: standalone`. As duas entradas HTML usam esse manifesto, as meta tags iOS de aplicação, título e status bar e o ícone PNG `apple-touch-icon` de 180px. Foram adicionadas versões PNG de 192px e 512px ao manifesto, derivadas da estrela e das cores do ícone existente. O Service Worker inclui os três novos ícones no cache isolado e mantém sua política de atualização sem recarregar partidas em andamento.

Arquivos desta revisão: `src/life/presentation.ts`, `Configuration.tsx`, `LifeCounter.tsx`, `life.css`, `index.html`, `marcador.html`, `public/manifest.webmanifest`, `public/life-icon-180.png`, `public/life-icon-192.png`, `public/life-icon-512.png`, `build/offline-plugin.ts`, `tests/life.test.ts`, `tests/ui.test.mjs` e este README. Não houve alterações em Firebase, estatísticas ou regras de Magic.

Validação: build e lint aprovados; 24 testes de domínio/acesso/Scryfall; 13 testes de navegador, incluindo orientação inicial/manual persistida, interação em painel invertido, três/quatro jogadores, desktop, fallback de tela cheia indisponível/recusada, instrução dispensável, standalone simulado e recuperação offline. Os cenários de iPhone e standalone foram simulados em Chrome por substituição das capacidades do navegador; não representam uma execução em WebKit ou em aparelho físico. O build mantém o aviso já existente de tamanho do bundle Firebase.

Para testar em iPhone, use HTTPS, abra `/marcador.html` no Safari e inicie uma nova partida de dois jogadores em retrato. Confira o painel superior invertido, use seus botões, gire manualmente, recarregue e retome: a escolha deve permanecer. Verifique paisagem, três/quatro jogadores e a opção de sair do modo imersivo. Em Compartilhar, escolha **Adicionar à Tela de Início** (mantenha **Abrir como App** habilitado se essa opção for apresentada). Abra pelo ícone e confirme a ausência do aviso de instalação. Prepare os arquivos nesse modo, crie uma sessão de teste, ative o modo avião, feche/reabra e retome.

O iOS pode manter armazenamento separado para o Safari e o aplicativo instalado: a transferência automática de uma partida já aberta no Safari para a PWA não é garantida. Esta alteração não apaga nem modifica a sessão em nenhum desses contextos. Antes de uma partida real, confirme os dados no contexto em que vai jogar e prepare o cache nele. O funcionamento sem barras pela Tela de Início depende da versão e das opções de instalação do sistema; não se promete forçar a Fullscreen API no iPhone. Referências: [configuração de aplicações web da Apple](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html), [manifesto e ícones no WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) e [armazenamento das aplicações instaladas](https://developer.apple.com/videos/play/wwdc2023/10120/).

Nenhum deploy foi executado nesta revisão.
