# Reglas del Agente

## Políticas de Despliegue y Entornos
- **Modificación de Entornos**: Cualquier cambio (commit, push, merge, deploy) debe realizarse estrictamente en el entorno o rama (branch) que el usuario indique explícitamente en su mensaje. No asumas que debes desplegar a todos los entornos al finalizar una tarea.
- **Producción Restringida**: NUNCA se debe fusionar o hacer push a la rama `prod` a menos que el usuario lo solicite de manera explícita y directa. Si el usuario pide probar algo, asume que es en ramas de desarrollo o prueba (`test`, `dev`, etc.), pero siempre pregunta o confírmalo si no está claro.
