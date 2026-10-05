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
```

O aplicativo normal se conecta ao projeto real `tracker-arcano`. Os testes de regras usam exclusivamente `demo-tracker-arcano` no Emulator, sem dados ou credenciais administrativas de produção. Na primeira execução, a CLI baixa o Emulator. Build estático em `dist`.

## Funcionalidades

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

**Remover o cadastro da interface não impede criar contas pela API pública do Firebase Auth.** Uma conta criada dessa forma continua sem acesso aos dados, porque somente o administrador pode gravar `membros`. As regras proíbem criar, editar ou listar membros pelo cliente. O administrador deve provisionar pelo console; não é necessário script ou Admin SDK para esta base.

## Troca temporária: limite de segurança no Spark

Authentication troca efetivamente a senha após reautenticação. Depois, a interface grava `senhaTrocadaNaInterface: true` em uma preferência privada. **Esse reconhecimento é editável pelo próprio cliente e não comprova a troca de senha.** As regras NÃO o usam para conceder acesso e NÃO comprovam a alteração da senha no Auth. Um membro autorizado pode contornar a exigência de interface usando a API diretamente. Não existe neste projeto backend confiável para atestar a troca; não se promete esse nível de enforcement no Spark.

Nenhuma senha é gravada no Firestore, localStorage, arquivos ou logs. Os inputs são limpos após sucesso. Se a senha mudar mas falhar a gravação da preferência, o administrador pode definir `senhaTemporaria: false` após verificar o caso; a senha anterior já não funcionará.

## Estrutura de dados e integridade

```text
membros/{uid}                             # administração; cliente lê somente o próprio documento
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

Executados com sucesso: build, lint, sete testes de domínio/Scryfall com respostas controladas e cinco testes no Firestore Emulator. Os testes de regras cobrem contas distintas, não membros, criação indevida de membros, consultas limitadas, campos/placares/datas, referências, versões imutáveis, gravação atômica e preservação de histórico. A integração Scryfall foi testada com respostas controladas; autenticação real, entrega de e-mails, comportamento visual no navegador e deploy remoto exigem a verificação manual abaixo. Build pode emitir aviso de tamanho do bundle do SDK Firebase; não impede a compilação.

`npm audit --omit=dev` terminou sem vulnerabilidades. Um override pontual atualiza `@grpc/grpc-js` usado pela distribuição Node do Firestore para uma versão corrigida, preservando a dependência Firebase existente. A auditoria da árvore completa ainda aponta 12 alertas nas ferramentas de desenvolvimento (5 moderados, 7 altos), que não são distribuídas no Hosting. Não foi aplicado `npm audit fix --force`, que propõe mudanças incompatíveis. Reavalie essas ferramentas antes de adotá-las em ambientes de CI sensíveis.

1. Autorize a conta existente, publique regras/índices manualmente, entre e confira perfil. Teste senha errada, recuperação e logout.
2. Para um membro com senha temporária, confirme o bloqueio da navegação e troque a senha usando a atual. Reentre e confirme que a troca não é pedida novamente.
3. Crie um deck de teste real usando `60 Mountain` (legal, embora não competitivo). Confira imagem/quantidade. Teste linha inválida, menos de 60, sideboard de 16 e cinco cópias de uma carta não básica; não devem salvar.
4. Teste nomes ambíguos/incompletos e uma carta banida. Teste internet desligada; não deve salvar como válido. Para uma carta dupla, use o nome completo com `//`.
5. Registre os oito placares. Totais esperados: 8 partidas, 3 vitórias, 3 derrotas, 2 empates, 7 jogos vencidos e 7 perdidos; taxas 37,5% em partidas e 50% em jogos.
6. Salve nova versão com `61 Mountain`. Na partida antiga, “Ver versão usada” deve mostrar 60. Renomeie e arquive; estatísticas devem permanecer. Restaure para registrar outra partida.
7. Corrija data/placar, confirme e confira filtros/totais; exclua uma partida com confirmação e confira os novos totais. Verifique uma data próxima à meia-noite sem mudança do dia.
8. Entre com outra conta autorizada e confirme estado vazio e isolamento. Uma conta Auth sem membro deve mostrar acesso aguardando autorização. Teste no celular e navegue pelo teclado.
