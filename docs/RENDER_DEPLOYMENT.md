# OfferFlow Render 部署

仓库根目录的 `render.yaml` 会创建以下资源：

- `offerflow-web`：Next.js 前端。
- `offerflow-api`：FastAPI 后端。
- `offerflow-db`：PostgreSQL 数据库。
- `offerflow-auth`：前后端共享的个人访问密码。

## 部署步骤

1. 在 Render Dashboard 选择 **New > Blueprint**。
2. 连接 GitHub 仓库 `shrevepribish969-hue/OfferFlow`。
3. 选择包含 `render.yaml` 的分支。
4. 在首次创建时填写 `DEEPSEEK_API_KEY`。不要把真实值写入 GitHub。
5. 部署完成后，在 Render 的 `offerflow-auth` Environment Group 中查看或重新设置：
   - 用户名：`offerflow`
   - 密码：Render 自动生成的 `APP_PASSWORD`
6. 打开 `offerflow-web` 的 `onrender.com` 地址，浏览器会要求输入上述用户名和密码。

## 本地开发

未设置 `APP_PASSWORD` 时，本地开发不会要求登录。默认连接：

- 前端：`http://localhost:3000`
- 后端：`http://127.0.0.1:8000`
- 数据库：仓库根目录下的 `offerflow.db`

如需覆盖配置，可在本地环境中设置：

- `BACKEND_URL`
- `DATABASE_URL`
- `CORS_ORIGINS`
- `APP_USERNAME`
- `APP_PASSWORD`
- `DEEPSEEK_API_KEY`

## 限制

- Blueprint 当前使用 Render 免费方案，适合首次验证。免费服务会休眠，免费 PostgreSQL 也不适合作为长期唯一数据副本；正式长期使用前应升级数据库并定期导出备份。
- 云端默认关闭语义 RAG，以避免下载大型嵌入模型；关键词与规则检索仍可工作。
- 浏览器插件的“收藏当前职位”仍默认连接本机后端，需要后续配置云端地址与认证。
