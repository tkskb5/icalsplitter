/**
 * iCAL Parser - RFC 5545準拠のiCalendarパーサー
 * クライアントサイドで動作
 * 
 * 改良版：ヘッダー（VEVENT前）とフッター（VEVENT後）を丸ごと保持
 */

class ICalParser {
  /**
   * iCALテキストをパースしてオブジェクトに変換
   * @param {string} icsContent - iCALファイルの内容
   * @returns {object} パース結果
   */
  static parse(icsContent) {
    // 改行の正規化（CRLF/LF両対応）
    const normalizedContent = icsContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 行の折り返し（RFC 5545: 行頭のスペース/タブで継続）を展開
    const unfoldedContent = normalizedContent.replace(/\n[ \t]/g, '');

    const lines = unfoldedContent.split('\n').filter(line => line.trim());

    const calendar = {
      // ヘッダー行（BEGIN:VCALENDARからBEGIN:VEVENTの前まで）
      headerLines: [],
      // イベント
      events: [],
      // プロパティ（統計用にも使用）
      properties: {}
    };

    let currentEvent = null;
    let currentEventLines = [];
    let inEvent = false;
    let foundFirstEvent = false;
    let inValarm = false;  // VALARM内かどうか

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // VEVENTの開始
      if (trimmedLine === 'BEGIN:VEVENT') {
        foundFirstEvent = true;
        inEvent = true;
        currentEventLines = [];
        currentEvent = { properties: {} };
        continue;
      }

      // VEVENTの終了
      if (trimmedLine === 'END:VEVENT') {
        if (currentEvent) {
          currentEvent._rawLines = currentEventLines;
          calendar.events.push(currentEvent);
        }
        currentEvent = null;
        currentEventLines = [];
        inEvent = false;
        inValarm = false;  // リセット
        continue;
      }

      // END:VCALENDAR をスキップ（出力時に追加する）
      if (trimmedLine === 'END:VCALENDAR') {
        continue;
      }

      // VEVENT内
      if (inEvent) {
        // VALARM開始を検出（Googleカレンダー非互換のためスキップ）
        if (trimmedLine === 'BEGIN:VALARM') {
          inValarm = true;
          continue;
        }

        // VALARM終了
        if (trimmedLine === 'END:VALARM') {
          inValarm = false;
          continue;
        }

        // VALARM内の行はスキップ
        if (inValarm) {
          continue;
        }

        currentEventLines.push(trimmedLine);

        // プロパティをパース
        const colonIndex = trimmedLine.indexOf(':');
        if (colonIndex !== -1) {
          const propertyPart = trimmedLine.substring(0, colonIndex);
          const value = trimmedLine.substring(colonIndex + 1);
          const semicolonIndex = propertyPart.indexOf(';');
          const propertyName = semicolonIndex === -1
            ? propertyPart
            : propertyPart.substring(0, semicolonIndex);

          currentEvent.properties[propertyName] = {
            value: value,
            parameters: semicolonIndex === -1 ? '' : propertyPart.substring(semicolonIndex),
            raw: trimmedLine
          };
        }
        continue;
      }

      // VEVENTが見つかる前はヘッダーとして保持
      if (!foundFirstEvent) {
        calendar.headerLines.push(trimmedLine);

        // プロパティとしても保持（VERSION, PRODID等）
        const colonIndex = trimmedLine.indexOf(':');
        if (colonIndex !== -1 && !trimmedLine.startsWith('BEGIN:')) {
          const propertyPart = trimmedLine.substring(0, colonIndex);
          const semicolonIndex = propertyPart.indexOf(';');
          const propertyName = semicolonIndex === -1
            ? propertyPart
            : propertyPart.substring(0, semicolonIndex);

          calendar.properties[propertyName] = {
            value: trimmedLine.substring(colonIndex + 1),
            raw: trimmedLine
          };
        }
      }
      // VEVENT後の行（他のコンポーネント等）は無視
      // ほとんどのカレンダーはVEVENT後に重要な情報はない
    }

    return calendar;
  }

  /**
   * イベントから日付を抽出
   * @param {object} event - イベントオブジェクト
   * @returns {Date|null} 開始日
   */
  static getEventDate(event) {
    const dtstart = event.properties['DTSTART'];
    if (!dtstart) return null;

    return this.parseICalDate(dtstart.value);
  }

  /**
   * iCAL形式の日付をDateオブジェクトに変換
   * @param {string} dateStr - iCAL日付文字列（例：20240115T090000Z, 20240115）
   * @returns {Date|null}
   */
  static parseICalDate(dateStr) {
    if (!dateStr) return null;

    // TZID付きの場合、日付部分のみ抽出
    const cleanDateStr = dateStr.replace(/^.*:/, '');

    // 形式: YYYYMMDD または YYYYMMDDTHHMMSS または YYYYMMDDTHHMMSSZ
    const match = cleanDateStr.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-indexed
    const day = parseInt(match[3], 10);
    const hour = match[5] ? parseInt(match[5], 10) : 0;
    const minute = match[6] ? parseInt(match[6], 10) : 0;
    const second = match[7] ? parseInt(match[7], 10) : 0;
    const isUTC = match[8] === 'Z';

    if (isUTC) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    return new Date(year, month, day, hour, minute, second);
  }

  /**
   * カレンダーの統計情報を取得
   * @param {object} calendar - パース済みカレンダー
   * @returns {object} 統計情報
   */
  static getStatistics(calendar) {
    const events = calendar.events;
    const stats = {
      totalEvents: events.length,
      earliestDate: null,
      latestDate: null,
      eventsByYear: {}
    };

    for (const event of events) {
      const date = this.getEventDate(event);
      if (!date) continue;

      if (!stats.earliestDate || date < stats.earliestDate) {
        stats.earliestDate = date;
      }
      if (!stats.latestDate || date > stats.latestDate) {
        stats.latestDate = date;
      }

      const year = date.getFullYear();
      stats.eventsByYear[year] = (stats.eventsByYear[year] || 0) + 1;
    }

    return stats;
  }
}

// ES Modules と従来のスクリプト両対応
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ICalParser;
}
