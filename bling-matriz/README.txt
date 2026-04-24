DADOS BLING — MATRIZ (filtrados pra sistema de estoque)
=====================================================

Esses arquivos sao o SNAPSHOT atual dos dados do Bling (empresa Matriz)
relevantes pra construir o sistema de controle de estoque / producao.

O QUE TEM AQUI:
  01_produtos_matriz.*         - Catalogo completo (usa como seed da ficha tecnica)
  02_vendas_por_mes.*          - Trend de vendas 12 meses
  03_vendas_por_dia_semana.*   - Padrao operacional
  04_trend_30_90_180_dias.*    - Velocidade recente
  05_top100_produtos_vendidos* - SKUs com maior saida (priorize a ficha tecnica deles)
  06_vendas_por_produto_mes.*  - Serie historica por SKU (input da previsao)
  _schema_tabelas_relevantes   - Schema das tabelas pra consultas futuras
  _RESUMO.json                 - Indice geral

PARA ATUALIZAR:
  rodar novamente  .claude/scripts/exportar-bling-matriz.py

GERADO EM: 24/04/2026 13:50
