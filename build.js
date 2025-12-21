const fs = require('fs');
const path = require('path');

// 定义源文件和目标目录
const sourceFiles = [
  'background.js',
  'popup.js',
  'popup.html',
  'icons',
  '_locales'
];

const browsers = {
  chrome: {
    manifest: 'manifest_chrome.json',
    output: 'dist/chrome'
  },
  firefox: {
    manifest: 'manifest_firefox.json',
    output: 'dist/firefox'
  }
};

// 递归复制目录
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 复制文件
function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

// 清理目录
function cleanDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 构建指定浏览器版本
function buildForBrowser(browser) {
  console.log(`🔨 Building for ${browser}...`);

  const config = browsers[browser];
  const outputDir = config.output;

  // 清理输出目录
  cleanDirectory(outputDir);

  // 创建输出目录
  fs.mkdirSync(outputDir, { recursive: true });

  // 复制源文件
  for (const file of sourceFiles) {
    const srcPath = path.join(__dirname, file);
    const destPath = path.join(outputDir, file);

    if (fs.existsSync(srcPath)) {
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        copyDirectory(srcPath, destPath);
      } else {
        copyFile(srcPath, destPath);
      }
    }
  }

  // 复制对应的 manifest 文件
  const manifestSrc = path.join(__dirname, config.manifest);
  const manifestDest = path.join(outputDir, 'manifest.json');
  copyFile(manifestSrc, manifestDest);

  console.log(`✅ ${browser} build completed: ${outputDir}`);
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const browser = args[0];

  if (browser && browsers[browser]) {
    buildForBrowser(browser);
  } else if (browser === 'all' || !browser) {
    console.log('🚀 Building for all browsers...\n');
    for (const browserName in browsers) {
      buildForBrowser(browserName);
      console.log('');
    }
    console.log('🎉 All builds completed!');
  } else {
    console.error(`❌ Unknown browser: ${browser}`);
    console.log('Usage: node build.js [chrome|firefox|all]');
    process.exit(1);
  }
}

main();
