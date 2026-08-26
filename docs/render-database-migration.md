# 将本地 OfferFlow 数据迁移到 Render

推荐直接在 OfferFlow 的 **设置 → 迁移本地数据库** 中选择 `offerflow.db`。
文件通过当前网站的 HTTPS 和登录验证上传，不需要开放 PostgreSQL 外部访问，
也不需要复制数据库地址。

网页导入只接受 `.db`、`.sqlite` 和 `.sqlite3`，文件上限为 15 MB。云端只要已有
业务数据就会拒绝导入；任何错误都会让整个数据库事务回滚。导入成功后即可删除
Render 中为旧迁移方式添加的 `temporary-migration` IP 规则。

下面的命令行工具保留为备用方案。它会把项目根目录的 `offerflow.db` 复制到
Render PostgreSQL，不会上传 SQLite 文件，也不会把数据库地址写入文件或 GitHub。

## 迁移前

1. 暂停使用本地 OfferFlow，避免迁移过程中继续产生新数据。
2. 在 Render 打开 `offerflow-db`，进入 **Connect**。
3. 找到 **External Database URL**，但不要把它发送到聊天或提交到 GitHub。
4. 确认目标 Render 数据库尚未保存需要保留的数据。脚本也会自动检查；只要
   任一 OfferFlow 表非空，就会在写入前停止。

## 执行

先进行只读检查：

```powershell
python scripts/migrate_sqlite_to_postgres.py --dry-run
```

安装 PostgreSQL 驱动（如果尚未安装）：

```powershell
pip install "psycopg[binary]>=3.2,<4"
```

开始迁移：

```powershell
python scripts/migrate_sqlite_to_postgres.py
```

脚本提示时粘贴 **External Database URL**。输入不会显示，也不会进入 PowerShell
命令历史。确认目标信息后，输入 `MIGRATE`。

迁移在单个数据库事务中运行。任何表写入或数量校验失败都会整体回滚。成功后，
脚本会显示本地和 Render 各表数量。

## 迁移后

1. 打开 `offerflow-web`，点击“重新加载”或按 `Ctrl+F5`。
2. 检查岗位、面试、记忆和海投线索数量。
3. 如果曾为本机临时开放 PostgreSQL 网络访问，在 Render 中删除该访问规则。

## 常见问题

- **目标数据库不是空库**：脚本会拒绝合并或覆盖。请先确认云端数据该如何保留。
- **无法连接数据库**：检查 External Database URL 是否完整，以及 Render 数据库的
  网络访问规则是否允许当前公网 IP。
- **找不到 psycopg**：运行上面的驱动安装命令后重试。
- **本地数据库不在默认位置**：使用
  `--source "C:\完整路径\offerflow.db"` 指定文件。
