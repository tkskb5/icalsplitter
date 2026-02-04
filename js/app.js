/**
 * iCAL Splitter - メインアプリケーション
 */

class ICalSplitterApp {
    constructor() {
        this.calendar = null;
        this.originalContent = null;
        this.originalFileName = null;
        this.generatedFiles = [];

        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        // ドロップゾーン
        this.dropzone = document.getElementById('dropzone');
        this.fileInput = document.getElementById('fileInput');

        // セクション
        this.fileInfoSection = document.getElementById('fileInfoSection');
        this.splitOptionsSection = document.getElementById('splitOptionsSection');
        this.progressSection = document.getElementById('progressSection');
        this.resultsSection = document.getElementById('resultsSection');

        // 統計
        this.statFileSize = document.getElementById('statFileSize');
        this.statEventCount = document.getElementById('statEventCount');
        this.statDateRange = document.getElementById('statDateRange');
        this.yearChart = document.getElementById('yearChart');

        // タブ
        this.tabs = document.querySelectorAll('.tab');
        this.tabPanels = document.querySelectorAll('.tab-panel');

        // ボタン
        this.splitByDateBtn = document.getElementById('splitByDateBtn');
        this.splitBySizeBtn = document.getElementById('splitBySizeBtn');
        this.splitByYearBtn = document.getElementById('splitByYearBtn');
        this.downloadAllBtn = document.getElementById('downloadAllBtn');

        // フォーム
        this.startDateInput = document.getElementById('startDate');
        this.endDateInput = document.getElementById('endDate');
        this.maxSizeInput = document.getElementById('maxSize');
        this.cleanModeInput = document.getElementById('cleanMode');

        // 進捗
        this.progressBar = document.getElementById('progressBar');
        this.progressText = document.getElementById('progressText');

        // 結果
        this.resultFiles = document.getElementById('resultFiles');
    }

    initEventListeners() {
        // ドラッグ&ドロップ
        this.dropzone.addEventListener('click', () => this.fileInput.click());
        this.dropzone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropzone.addEventListener('dragleave', () => this.handleDragLeave());
        this.dropzone.addEventListener('drop', (e) => this.handleDrop(e));
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // タブ切り替え
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // 分割ボタン
        this.splitByDateBtn.addEventListener('click', () => this.splitByDate());
        this.splitBySizeBtn.addEventListener('click', () => this.splitBySize());
        this.splitByYearBtn.addEventListener('click', () => this.splitByYear());
        this.downloadAllBtn.addEventListener('click', () => this.downloadAllAsZip());
    }

    handleDragOver(e) {
        e.preventDefault();
        this.dropzone.classList.add('dropzone--dragover');
    }

    handleDragLeave() {
        this.dropzone.classList.remove('dropzone--dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.dropzone.classList.remove('dropzone--dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.loadFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.loadFile(files[0]);
        }
    }

    async loadFile(file) {
        if (!file.name.match(/\.(ics|ical)$/i)) {
            alert('iCALファイル(.ics, .ical)を選択してください');
            return;
        }

        this.originalFileName = file.name.replace(/\.(ics|ical)$/i, '');

        try {
            this.showProgress('ファイルを読み込み中...', 10);

            const content = await this.readFileAsText(file);
            this.originalContent = content;

            this.showProgress('ファイルを解析中...', 50);

            this.calendar = ICalParser.parse(content);
            const stats = ICalParser.getStatistics(this.calendar);

            this.showProgress('完了', 100);
            this.hideProgress();

            this.displayFileInfo(file, stats);

        } catch (error) {
            console.error('ファイル読み込みエラー:', error);
            alert('ファイルの読み込みに失敗しました: ' + error.message);
            this.hideProgress();
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('ファイル読み込みエラー'));
            reader.readAsText(file);
        });
    }

    displayFileInfo(file, stats) {
        // ファイルサイズ
        const sizeKB = (file.size / 1024).toFixed(1);
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        this.statFileSize.textContent = file.size > 1024 * 1024
            ? `${sizeMB} MB`
            : `${sizeKB} KB`;

        // イベント数
        this.statEventCount.textContent = stats.totalEvents.toLocaleString();

        // 期間
        if (stats.earliestDate && stats.latestDate) {
            this.statDateRange.textContent =
                `${this.formatYearMonth(stats.earliestDate)} - ${this.formatYearMonth(stats.latestDate)}`;
        } else {
            this.statDateRange.textContent = '-';
        }

        // 年別グラフ
        this.renderYearChart(stats.eventsByYear, stats.totalEvents);

        // セクション表示
        this.fileInfoSection.classList.add('file-info--visible');
        this.splitOptionsSection.classList.add('split-options--visible');
        this.resultsSection.classList.remove('results--visible');
    }

    renderYearChart(eventsByYear, totalEvents) {
        const years = Object.keys(eventsByYear).sort();
        const maxCount = Math.max(...Object.values(eventsByYear));

        this.yearChart.innerHTML = years.map(year => {
            const count = eventsByYear[year];
            const percentage = (count / maxCount * 100).toFixed(1);
            return `
        <div class="year-row">
          <span class="year-row__label">${year}</span>
          <div class="year-row__bar-container">
            <div class="year-row__bar" style="width: ${percentage}%"></div>
          </div>
          <span class="year-row__count">${count.toLocaleString()}</span>
        </div>
      `;
        }).join('');
    }

    switchTab(tabId) {
        this.tabs.forEach(tab => {
            tab.classList.toggle('tab--active', tab.dataset.tab === tabId);
        });
        this.tabPanels.forEach(panel => {
            panel.classList.toggle('tab-panel--active', panel.id === `panel-${tabId}`);
        });
    }

    showProgress(text, percent) {
        this.progressSection.classList.add('progress--visible');
        this.progressBar.style.width = `${percent}%`;
        this.progressText.textContent = text;
    }

    hideProgress() {
        setTimeout(() => {
            this.progressSection.classList.remove('progress--visible');
        }, 500);
    }

    splitByDate() {
        if (!this.calendar) return;

        const startDate = this.startDateInput.value
            ? new Date(this.startDateInput.value)
            : null;
        const endDate = this.endDateInput.value
            ? new Date(this.endDateInput.value + 'T23:59:59')
            : null;

        this.showProgress('期間でフィルタリング中...', 30);

        const filteredEvents = ICalWriter.filterByDateRange(
            this.calendar.events,
            startDate,
            endDate
        );

        this.showProgress('ファイル生成中...', 70);

        const cleanMode = this.cleanModeInput ? this.cleanModeInput.checked : true;
        const icsContent = ICalWriter.write(this.calendar, filteredEvents, cleanMode);

        let fileName = this.originalFileName;
        if (startDate) fileName += `_from-${this.formatDateForFilename(startDate)}`;
        if (endDate) fileName += `_to-${this.formatDateForFilename(endDate)}`;
        fileName += '.ics';

        this.generatedFiles = [{
            name: fileName,
            content: icsContent,
            size: ICalWriter.getByteSize(icsContent),
            eventCount: filteredEvents.length
        }];

        this.showProgress('完了', 100);
        this.hideProgress();
        this.displayResults();
    }

    splitBySize() {
        if (!this.calendar) return;

        const maxSizeKB = parseInt(this.maxSizeInput.value, 10) || 500;
        const maxSizeBytes = maxSizeKB * 1024;
        const cleanMode = this.cleanModeInput ? this.cleanModeInput.checked : true;

        this.showProgress('サイズで分割中...', 30);

        const chunks = ICalWriter.splitBySize(
            this.calendar,
            this.calendar.events,
            maxSizeBytes,
            cleanMode
        );

        this.showProgress('ファイル生成中...', 70);

        this.generatedFiles = chunks.map((chunk, index) => ({
            name: `${this.originalFileName}_part${index + 1}.ics`,
            content: chunk.content,
            size: ICalWriter.getByteSize(chunk.content),
            eventCount: chunk.eventCount,
            startDate: chunk.startDate,
            endDate: chunk.endDate
        }));

        this.showProgress('完了', 100);
        this.hideProgress();
        this.displayResults();
    }

    splitByYear() {
        if (!this.calendar) return;

        this.showProgress('年別に分割中...', 30);

        const byYear = ICalWriter.splitByYear(this.calendar.events);

        this.showProgress('ファイル生成中...', 70);

        this.generatedFiles = Object.entries(byYear)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([year, events]) => {
                const cleanMode = this.cleanModeInput ? this.cleanModeInput.checked : true;
                const content = ICalWriter.write(this.calendar, events, cleanMode);
                return {
                    name: `${this.originalFileName}_${year}.ics`,
                    content: content,
                    size: ICalWriter.getByteSize(content),
                    eventCount: events.length
                };
            });

        this.showProgress('完了', 100);
        this.hideProgress();
        this.displayResults();
    }

    displayResults() {
        this.resultFiles.innerHTML = this.generatedFiles.map((file, index) => {
            const sizeKB = (file.size / 1024).toFixed(1);
            const dateRange = this.formatDateRange(file.startDate, file.endDate);
            return `
        <div class="result-file">
          <div class="result-file__info">
            <span class="result-file__icon">📄</span>
            <div>
              <div class="result-file__name">${file.name}</div>
              <div class="result-file__size">${sizeKB} KB · ${file.eventCount.toLocaleString()} イベント</div>
              ${dateRange ? `<div class="result-file__date-range">📅 ${dateRange}</div>` : ''}
            </div>
          </div>
          <div class="result-file__actions">
            <button class="btn btn--secondary result-file__preview" data-index="${index}" title="内容を確認">
              👁️
            </button>
            <button class="btn btn--secondary result-file__download" data-index="${index}">
              ダウンロード
            </button>
          </div>
        </div>
      `;
        }).join('');

        // ダウンロードボタンのイベント
        this.resultFiles.querySelectorAll('.result-file__download').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index, 10);
                this.downloadFile(this.generatedFiles[index]);
            });
        });

        // プレビューボタンのイベント
        this.resultFiles.querySelectorAll('.result-file__preview').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index, 10);
                this.previewFile(this.generatedFiles[index]);
            });
        });

        this.resultsSection.classList.add('results--visible');
    }

    /**
     * ファイル内容をプレビュー
     */
    previewFile(file) {
        // 最初の2000文字を表示
        const preview = file.content.substring(0, 2000);
        const modal = document.createElement('div');
        modal.className = 'preview-modal';
        modal.innerHTML = `
            <div class="preview-modal__content">
                <div class="preview-modal__header">
                    <h3>📄 ${file.name}</h3>
                    <button class="preview-modal__close">✕</button>
                </div>
                <pre class="preview-modal__code">${this.escapeHtml(preview)}${file.content.length > 2000 ? '\n\n... (省略)' : ''}</pre>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.preview-modal__close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) document.body.removeChild(modal);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 日付範囲をフォーマット
     */
    formatDateRange(startDate, endDate) {
        if (!startDate && !endDate) return null;

        const fmt = (d) => {
            if (!d) return '?';
            return this.formatFullDate(d);
        };

        if (startDate && endDate) {
            // 同じ日の場合は1つだけ表示
            if (startDate.getTime() === endDate.getTime()) {
                return fmt(startDate);
            }
            return `${fmt(startDate)} 〜 ${fmt(endDate)}`;
        }
        return fmt(startDate || endDate);
    }

    async downloadFile(file) {
        const blob = new Blob([file.content], { type: 'text/calendar;charset=utf-8' });

        // File System Access API対応チェック（Chrome/Edge）
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: file.name,
                    types: [{
                        description: 'iCalendar File',
                        accept: { 'text/calendar': ['.ics'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return;
            } catch (err) {
                // ユーザーがキャンセルした場合
                if (err.name === 'AbortError') return;
                console.warn('File System Access API failed, falling back:', err);
            }
        }

        // フォールバック：従来のダウンロード方式
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async downloadAllAsZip() {
        if (this.generatedFiles.length === 0) return;

        this.showProgress('ZIPファイル作成中...', 30);

        const zip = new JSZip();

        for (const file of this.generatedFiles) {
            zip.file(file.name, file.content);
        }

        this.showProgress('圧縮中...', 70);

        const zipBlob = await zip.generateAsync({ type: 'blob' });

        this.showProgress('完了', 100);
        this.hideProgress();

        const zipFileName = `${this.originalFileName}_split.zip`;

        // File System Access API対応チェック（Chrome/Edge）
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: zipFileName,
                    types: [{
                        description: 'ZIP Archive',
                        accept: { 'application/zip': ['.zip'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(zipBlob);
                await writable.close();
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.warn('File System Access API failed, falling back:', err);
            }
        }

        // フォールバック
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    formatDateForFilename(date) {
        return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    }

    /**
     * 日付を年/月形式でフォーマット
     * @param {Date} date - 日付オブジェクト
     * @returns {string} "YYYY/M" 形式の文字列
     */
    formatYearMonth(date) {
        if (!date) return '-';
        return `${date.getFullYear()}/${date.getMonth() + 1}`;
    }

    /**
     * 日付を完全な形式でフォーマット
     * @param {Date} date - 日付オブジェクト
     * @returns {string} "YYYY/M/D" 形式の文字列
     */
    formatFullDate(date) {
        if (!date) return '-';
        return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    }
}

// アプリ初期化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ICalSplitterApp();
});
