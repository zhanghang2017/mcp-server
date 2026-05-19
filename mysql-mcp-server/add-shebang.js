import fs from 'fs';
import path from 'path';

// 指向你打包出来的 JS 文件路径
const filePath = path.resolve('dist/index.js');

try {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 检查是否已经加过了，避免重复添加
    if (!content.startsWith('#!/usr/bin/env node')) {
      const shebang = '#!/usr/bin/env node\n';
      fs.writeFileSync(filePath, shebang + content, 'utf8');
      console.log('✅ Shebang 头部添加成功！');
    } else {
      console.log('ℹ️ Shebang 已经存在，跳过添加。');
    }
  } else {
    console.error(`❌ 未找到打包文件: ${filePath}，请检查路径。`);
  }
} catch (error) {
  console.error('❌ 添加 Shebang 失败:', error);
}