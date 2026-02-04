/**
 * iCAL Writer - iCalendarファイル生成
 * 
 * 改良版：ヘッダーを丸ごと保持してイベントを出力
 * RFC 5545準拠の行折り返し（75文字制限）対応
 */

class ICalWriter {
    // RFC 5545: 行の最大長（バイト数）
    static MAX_LINE_LENGTH = 75;

    /**
     * 長い行をRFC 5545に従って折り返す
     * @param {string} line - 折り返す行
     * @returns {string} 折り返し済みの行（CRLFで結合）
     */
    static foldLine(line) {
        if (line.length <= this.MAX_LINE_LENGTH) {
            return line;
        }

        const result = [];
        let remaining = line;
        let isFirst = true;

        while (remaining.length > 0) {
            // 最初の行は75文字、継続行は74文字（先頭スペース分）
            const maxLen = isFirst ? this.MAX_LINE_LENGTH : this.MAX_LINE_LENGTH - 1;

            if (remaining.length <= maxLen) {
                result.push(isFirst ? remaining : ' ' + remaining);
                break;
            }

            // UTF-8のマルチバイト文字を考慮して切断位置を調整
            let cutPos = maxLen;
            // マルチバイト文字の途中で切らないように調整
            while (cutPos > 0 && this.isContinuationByte(remaining, cutPos)) {
                cutPos--;
            }

            const chunk = remaining.substring(0, cutPos);
            result.push(isFirst ? chunk : ' ' + chunk);
            remaining = remaining.substring(cutPos);
            isFirst = false;
        }

        return result.join('\r\n');
    }

    /**
     * 指定位置がUTF-8継続バイトかどうか判定（簡易版）
     */
    static isContinuationByte(str, pos) {
        if (pos <= 0 || pos >= str.length) return false;
        // 高サロゲートの後で切らない
        const charCode = str.charCodeAt(pos - 1);
        return charCode >= 0xD800 && charCode <= 0xDBFF;
    }

    /**
     * Googleカレンダーと互換性のあるプロパティかどうか判定
     * @param {string} line - プロパティ行
     * @returns {boolean} 許可されたプロパティかどうか
     */
    static isAllowedProperty(line) {
        // プロパティ名を抽出
        const colonIndex = line.indexOf(':');
        const semicolonIndex = line.indexOf(';');
        let propName;

        if (semicolonIndex !== -1 && (colonIndex === -1 || semicolonIndex < colonIndex)) {
            propName = line.substring(0, semicolonIndex).toUpperCase();
        } else if (colonIndex !== -1) {
            propName = line.substring(0, colonIndex).toUpperCase();
        } else {
            return false;
        }

        // Googleカレンダーと非互換の可能性があるプロパティを除外
        const blockedProperties = [
            'X-APPLE-',           // Apple固有
            'X-WR-ALARMUID',      // Apple アラームID
            'ACKNOWLEDGED',       // アラーム確認
            'ATTACH',             // 添付ファイル（バイナリ問題を起こしやすい）
        ];

        for (const blocked of blockedProperties) {
            if (propName.startsWith(blocked) || propName === blocked) {
                return false;
            }
        }

        return true;
    }

    /**
     * カレンダーオブジェクトからiCALテキストを生成
     * @param {object} calendar - パース済みカレンダー
     * @param {object[]} events - 出力するイベントの配列
     * @param {boolean} cleanMode - Googleカレンダー互換モード（デフォルト: true）
     * @returns {string} iCAL形式のテキスト
     */
    static write(calendar, events, cleanMode = true) {
        const outputLines = [];

        // ヘッダー行を折り返して出力（VTIMEZONE等も含む）
        if (calendar.headerLines && calendar.headerLines.length > 0) {
            for (const line of calendar.headerLines) {
                outputLines.push(this.foldLine(line));
            }
        } else {
            // ヘッダーがない場合はデフォルトを生成
            outputLines.push('BEGIN:VCALENDAR');
            outputLines.push('VERSION:2.0');
            outputLines.push('PRODID:-//iCAL Splitter//EN');
        }

        // イベントを出力
        for (const event of events) {
            outputLines.push('BEGIN:VEVENT');

            if (event._rawLines && event._rawLines.length > 0) {
                // 生の行データをフィルタリングして出力
                for (const line of event._rawLines) {
                    if (line.trim()) {
                        // cleanModeがオンの場合のみフィルタリング
                        if (cleanMode && !this.isAllowedProperty(line)) {
                            continue;
                        }
                        outputLines.push(this.foldLine(line));
                    }
                }
            } else {
                // フォールバック：プロパティから再構築
                for (const [key, prop] of Object.entries(event.properties)) {
                    if (prop.raw && prop.raw.trim()) {
                        if (cleanMode && !this.isAllowedProperty(prop.raw)) {
                            continue;
                        }
                        outputLines.push(this.foldLine(prop.raw));
                    }
                }
            }

            outputLines.push('END:VEVENT');
        }

        // カレンダーフッター
        outputLines.push('END:VCALENDAR');

        // RFC 5545: CRLFで結合、末尾にもCRLF
        return outputLines.join('\r\n') + '\r\n';
    }

    /**
     * イベントを期間でフィルタリング
     * @param {object[]} events - イベント配列
     * @param {Date} startDate - 開始日（含む）
     * @param {Date} endDate - 終了日（含む）
     * @returns {object[]} フィルタリング済みイベント
     */
    static filterByDateRange(events, startDate, endDate) {
        return events.filter(event => {
            const date = ICalParser.getEventDate(event);
            if (!date) return true; // 日付がないイベントは含める

            if (startDate && date < startDate) return false;
            if (endDate && date > endDate) return false;
            return true;
        });
    }

    /**
     * イベントを年ごとに分割
     * @param {object[]} events - イベント配列
     * @returns {object} 年をキーとするイベント配列のマップ
     */
    static splitByYear(events) {
        const byYear = {};

        for (const event of events) {
            const date = ICalParser.getEventDate(event);
            const year = date ? date.getFullYear() : 'unknown';

            if (!byYear[year]) {
                byYear[year] = [];
            }
            byYear[year].push(event);
        }

        return byYear;
    }

    /**
     * イベントをサイズで分割
     * @param {object} calendar - カレンダーオブジェクト
     * @param {object[]} events - イベント配列
     * @param {number} maxSizeBytes - 最大ファイルサイズ（バイト）
     * @param {boolean} cleanMode - Googleカレンダー互換モード
     * @returns {object[]} 分割結果の配列 [{content, startDate, endDate}, ...]
     */
    static splitBySize(calendar, events, maxSizeBytes, cleanMode = true) {
        const results = [];
        let currentEvents = [];
        let currentSize = this.getHeaderFooterSize(calendar);

        // イベントを日付順にソート（新しい順 = 降順）
        const sortedEvents = [...events].sort((a, b) => {
            const dateA = ICalParser.getEventDate(a);
            const dateB = ICalParser.getEventDate(b);
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            return dateB - dateA; // 新しい順（降順）
        });

        for (const event of sortedEvents) {
            const eventSize = this.getEventSize(event);

            if (currentSize + eventSize > maxSizeBytes && currentEvents.length > 0) {
                // 現在のチャンクを確定（期間情報付き）
                results.push(this.createChunkResult(calendar, currentEvents, cleanMode));
                currentEvents = [];
                currentSize = this.getHeaderFooterSize(calendar);
            }

            currentEvents.push(event);
            currentSize += eventSize;
        }

        // 残りのイベントを出力
        if (currentEvents.length > 0) {
            results.push(this.createChunkResult(calendar, currentEvents, cleanMode));
        }

        return results;
    }

    /**
     * チャンク結果オブジェクトを作成
     * @param {object} calendar - カレンダーオブジェクト
     * @param {object[]} events - イベント配列
     * @param {boolean} cleanMode - Googleカレンダー互換モード
     * @returns {object} {content, startDate, endDate, eventCount}
     */
    static createChunkResult(calendar, events, cleanMode = true) {
        const dates = events
            .map(e => ICalParser.getEventDate(e))
            .filter(d => d !== null)
            .sort((a, b) => a - b);

        return {
            content: this.write(calendar, events, cleanMode),
            startDate: dates.length > 0 ? dates[0] : null,
            endDate: dates.length > 0 ? dates[dates.length - 1] : null,
            eventCount: events.length
        };
    }

    /**
     * ヘッダーとフッターのサイズを計算
     * @param {object} calendar - カレンダーオブジェクト
     * @returns {number} バイト数
     */
    static getHeaderFooterSize(calendar) {
        let size = 'END:VCALENDAR\r\n'.length;

        if (calendar.headerLines && calendar.headerLines.length > 0) {
            for (const line of calendar.headerLines) {
                size += line.length + 2; // +2 for CRLF
            }
        } else {
            size += 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//iCAL Splitter//EN\r\n'.length;
        }

        return size;
    }

    /**
     * イベントのサイズを計算
     * @param {object} event - イベントオブジェクト
     * @returns {number} バイト数
     */
    static getEventSize(event) {
        let size = 'BEGIN:VEVENT\r\n'.length + 'END:VEVENT\r\n'.length;

        if (event._rawLines && event._rawLines.length > 0) {
            for (const line of event._rawLines) {
                size += line.length + 2;
            }
        } else {
            for (const prop of Object.values(event.properties)) {
                size += prop.raw.length + 2;
            }
        }

        return size;
    }

    /**
     * iCALテキストのバイトサイズを取得
     * @param {string} text - iCALテキスト
     * @returns {number} バイト数
     */
    static getByteSize(text) {
        return new Blob([text]).size;
    }
}

// ES Modules と従来のスクリプト両対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ICalWriter;
}
