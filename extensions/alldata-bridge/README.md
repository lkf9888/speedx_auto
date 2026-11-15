# SPEEDX ALLDATA 助手（Chrome 扩展）

让维修工作台（repair.speedxrental.com）用**这台电脑上已登录的 ALLDATA** 做三件事：

- 把工作台里核对好的估价单草稿建成 ALLDATA 估价单（Estimate）
- 查 ALLDATA 历史单据（估价单 / 工单 / 发票）
- 打开单据 PDF，用 Chrome 自带的 PDF 查看器打印或下载

ALLDATA 有反机器人防护，服务器不能替我们登录，所以这些操作都在员工自己的 Chrome 里完成。扩展不保存、也看不到 ALLDATA 密码；只有员工在工作台点按钮时才会动作。

## 安装（每台电脑一次）

1. 把整个 `alldata-bridge` 文件夹放到电脑上一个固定位置（例如“文稿/SPEEDX/alldata-bridge”），之后不要移动或删除。
2. Chrome 地址栏打开 `chrome://extensions`。
3. 打开右上角“开发者模式”。
4. 点“加载已解压的扩展程序”，选择这个 `alldata-bridge` 文件夹。
5. 在同一个 Chrome 里打开 https://my.alldata.com 并登录 ALLDATA（之后保持登录即可）。
6. 打开（或刷新）维修工作台。

## 使用

- 在对话里报价确定后说“开 ALLDATA 估价单”（可以带上客户姓名电话、里程），工作台会生成一张草稿卡片。
- 在卡片里按电话或姓名查找 ALLDATA 客户，选中客户和车辆（或选“不关联客户”），点“在 ALLDATA 创建估价单”。
- 建好后点“打开 PDF（打印 / 下载）”。
- 历史单据和收据：点工作台右上角“ALLDATA 单据”，按姓名 / 电话 / 单号查找，点对应的 PDF 按钮。

建单时技师默认 Jason、服务顾问默认 Kevin（和 ALLDATA 里“Create New Document”一样）；工时都记在 “Basic Labor” 费率下。转工单、开发票、收款仍在 ALLDATA 里操作。

## Westcan（Nexpart）查价（1.1.0 起）

WorldPac 本地仓库没货时，工作台会自动用这台电脑的 Chrome 去 Westcan 的 Nexpart（https://3501660.nexpart.com）查同一个零件：

- 需要在同一个 Chrome 里登录 Nexpart，并**保持一个 Nexpart 标签页开着**（没有开着的，扩展会在后台打开目录页；没登录会提示先登录）。
- 只查价格和库存，不下单、不保存任何东西。扩展会在 Nexpart 里选中这台车（和员工手动选车一样）。
- 报价规则：Westcan 零件按拿货价 × 1.3；顺序是 WorldPac 本地有货 → Westcan（Richmond 有货优先，其次其他分店、明天到）→ WorldPac 调货 → 待补价。
- Nexpart 分不清发动机时，卡片会提示先告诉助手发动机或 VIN。

## 更新

扩展代码有更新时，把新文件覆盖到同一个文件夹，然后在 `chrome://extensions` 里点这个扩展的刷新按钮。
