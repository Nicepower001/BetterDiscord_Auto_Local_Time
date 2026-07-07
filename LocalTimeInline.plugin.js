/**
 * @name LocalTimeInline
 * @author Nicepower001
 * @description Replaces time information into local time information.
 * @version 1.1.0
 */

module.exports = class LocalTimeInline {
    constructor() {
        this.styleId = "local-time-inline-style";
        this.observerInstance = null;
        this.zoneWatcher = null;
        this.currentZone = "";
        this.mutating = false;
        this.formatterCache = new Map();
        this.zoneMap = new Map();
        this.defaultLocalTimeZone = "Europe/Berlin";
        this.storageKey = "local-time-inline-timezone";
        this.monthDatePattern = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?";
        this.numericDatePattern = "\\d{1,2}[./-]\\d{1,2}(?:[./-]\\d{2,4})";
        const time = "\\d{1,2}(?::\\d{2}){0,2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?";
        const leadingDate = `(${this.monthDatePattern}|${this.numericDatePattern})`;
        this.entryRegex = new RegExp(`(?:${leadingDate}\\s*,?\\s*)?(${time})(?:\\s*(?:-|–|—|to)\\s*(${time}))?`, "gi");
    }

    start() {
        this.currentZone = this.getLocalTimeZone();
        this.buildZoneMap();
        this.injectStyle();
        this.observe();
        this.scan(document.body);
        this.zoneWatcher = setInterval(() => {
            const nextZone = this.getLocalTimeZone();
            if (nextZone !== this.currentZone) {
                this.currentZone = nextZone;
                this.restore();
                this.scan(document.body);
            }
        }, 30000);
    }

    stop() {
        if (this.zoneWatcher) {
            clearInterval(this.zoneWatcher);
            this.zoneWatcher = null;
        }
        if (this.observerInstance) {
            this.observerInstance.disconnect();
            this.observerInstance = null;
        }
        this.restore();
        this.removeStyle();
        this.formatterCache.clear();
        this.zoneMap.clear();
    }

    getLocalTimeZone() {
        try {
            const saved = typeof localStorage !== "undefined" ? localStorage.getItem(this.storageKey) : null;
            if (saved && this.isValidTimeZone(saved)) return saved;
        } catch {}

        try {
            const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (detected && this.isValidTimeZone(detected)) return detected;
        } catch {}

        return this.defaultLocalTimeZone;
    }

    buildZoneMap() {
        this.zoneMap.clear();

        const fixed = {
            UTC: { type: "offset", offsetMinutes: 0 },
            GMT: { type: "offset", offsetMinutes: 0 },
            CET: { type: "offset", offsetMinutes: 60 },
            CEST: { type: "offset", offsetMinutes: 120 },
            WET: { type: "offset", offsetMinutes: 0 },
            WEST: { type: "offset", offsetMinutes: 60 },
            EET: { type: "offset", offsetMinutes: 120 },
            EEST: { type: "offset", offsetMinutes: 180 },
            ET: { type: "iana", timeZone: "America/New_York" },
            CT: { type: "iana", timeZone: "America/Chicago" },
            MT: { type: "iana", timeZone: "America/Denver" },
            PT: { type: "iana", timeZone: "America/Los_Angeles" },
            AKT: { type: "iana", timeZone: "America/Anchorage" },
            HT: { type: "iana", timeZone: "Pacific/Honolulu" },
            EST: { type: "offset", offsetMinutes: -300 },
            EDT: { type: "offset", offsetMinutes: -240 },
            CST: { type: "offset", offsetMinutes: -360 },
            CDT: { type: "offset", offsetMinutes: -300 },
            MST: { type: "offset", offsetMinutes: -420 },
            MDT: { type: "offset", offsetMinutes: -360 },
            PST: { type: "offset", offsetMinutes: -480 },
            PDT: { type: "offset", offsetMinutes: -420 }
        };

        for (const [key, value] of Object.entries(fixed)) this.zoneMap.set(key, value);
    }

    injectStyle() {
        this.removeStyle();
        const style = document.createElement("style");
        style.id = this.styleId;
        style.textContent = `
            .ltz-code {
                display: inline-block;
                box-sizing: border-box;
                margin: 0 1px;
                padding: 0 4px;
                border-radius: 4px;
                background: var(--background-secondary);
                color: var(--text-normal);
                font-family: var(--font-code);
                font-size: 0.875em;
                line-height: 1.3;
                white-space: nowrap;
                vertical-align: baseline;
            }
        `;
        document.head.appendChild(style);
    }

    removeStyle() {
        const style = document.getElementById(this.styleId);
        if (style) style.remove();
    }

    observe() {
        this.observerInstance = new MutationObserver(mutations => {
            if (this.mutating) return;
            const nodes = new Set();
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) nodes.add(node);
            }
            for (const node of nodes) this.scan(node);
        });

        this.observerInstance.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    restore() {
        const groups = document.querySelectorAll('[data-ltz-group="1"]');
        if (!groups.length) return;
        this.mutating = true;
        try {
            for (const group of groups) {
                const original = group.dataset.ltzOriginal || "";
                group.replaceWith(document.createTextNode(original));
            }
        } finally {
            this.mutating = false;
        }
    }

    scan(root) {
        if (!root) return;

        if (root.nodeType === Node.TEXT_NODE) {
            this.processTextNode(root);
            return;
        }

        if (root.nodeType !== Node.ELEMENT_NODE) return;
        if (this.shouldSkipElement(root)) return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: node => this.shouldProcessTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        });

        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        for (const node of textNodes) this.processTextNode(node);
    }

    shouldSkipElement(element) {
        if (!(element instanceof Element)) return true;
        if (element.closest('[data-ltz-group="1"], .ltz-code, code, pre, textarea, input, [contenteditable="true"], [role="textbox"]')) return true;
        const tag = element.tagName;
        return tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT" || tag === "CODE" || tag === "PRE";
    }

    shouldProcessTextNode(node) {
        if (!node || node.nodeType !== Node.TEXT_NODE) return false;
        const text = node.nodeValue;
        if (!text || !text.trim()) return false;
        if (!/[0-9]/.test(text)) return false;
        if (!/[A-Za-z/]/.test(text)) return false;
        const parent = node.parentElement;
        if (!parent) return false;
        if (parent.closest('[data-ltz-group="1"], .ltz-code, code, pre, textarea, input, [contenteditable="true"], [role="textbox"]')) return false;
        return true;
    }

    processTextNode(node) {
        if (!this.shouldProcessTextNode(node)) return;
        const text = node.nodeValue;
        if (!text) return;

        const matches = this.findMatches(text);
        if (!matches.length) return;

        const fragment = document.createDocumentFragment();
        let cursor = 0;

        for (const match of matches) {
            if (match.replaceStart < cursor) continue;

            if (match.replaceStart > cursor) {
                fragment.appendChild(document.createTextNode(text.slice(cursor, match.replaceStart)));
            }

            const wrapper = document.createElement("span");
            wrapper.dataset.ltzGroup = "1";
            wrapper.dataset.ltzOriginal = text.slice(match.replaceStart, match.end);

            const chip = document.createElement("span");
            chip.className = "ltz-code";
            chip.textContent = match.label;

            wrapper.appendChild(chip);
            fragment.appendChild(wrapper);
            cursor = match.end;
        }

        if (cursor < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(cursor)));
        }

        this.mutating = true;
        try {
            node.replaceWith(fragment);
        } finally {
            this.mutating = false;
        }
    }

    findMatches(text) {
        const matches = [];
        this.entryRegex.lastIndex = 0;

        let match;
        while ((match = this.entryRegex.exec(text)) !== null) {
            const leadingDateText = match[1] || null;
            const firstTime = match[2];
            const secondTime = match[3] || null;

            let zoneMatch = this.parseZoneAt(text, match.index + match[0].length);
            let trailingDate = null;
            let dateText = leadingDateText;
            let explicitDate = Boolean(dateText);

            if (!zoneMatch && !leadingDateText) {
                const dateThenZone = this.parseDateThenZoneAt(text, match.index + match[0].length);
                if (dateThenZone) {
                    zoneMatch = { zoneInfo: dateThenZone.zoneInfo, end: dateThenZone.end };
                    dateText = dateThenZone.dateText;
                    explicitDate = true;
                }
            }

            if (!zoneMatch) {
                if (match[0].length === 0) this.entryRegex.lastIndex++;
                continue;
            }

            if (!dateText) {
                trailingDate = this.parseAdjacentDateAt(text, zoneMatch.end);
                if (trailingDate) {
                    dateText = trailingDate.value;
                    explicitDate = true;
                }
            }

            let label = null;

            if (secondTime) {
                const left = this.convert(dateText, firstTime, zoneMatch.zoneInfo, explicitDate);
                const right = this.convert(dateText, secondTime, zoneMatch.zoneInfo, explicitDate);
                if (left && right) {
                    const leftText = explicitDate
                        ? `${left.display} ${left.localDateText}`
                        : (left.dayText ? `${left.display} ${left.dayText}` : left.display);

                    const rightText = explicitDate
                        ? `${right.display} ${right.localDateText}`
                        : (right.dayText ? `${right.display} ${right.dayText}` : right.display);

                    label = `${leftText}–${rightText}`;
                }
            } else {
                const converted = this.convert(dateText, firstTime, zoneMatch.zoneInfo, explicitDate);
                if (converted) {
                    label = explicitDate
                        ? `${converted.display} ${converted.localDateText}`
                        : (converted.dayText ? `${converted.display} ${converted.dayText}` : converted.display);
                }
            }

            if (label) {
                const replaceEnd = trailingDate ? trailingDate.end : zoneMatch.end;
                const fullMatchText = text.slice(match.index, replaceEnd);
                const timeOffset = fullMatchText.indexOf(firstTime);

                if (timeOffset !== -1) {
                    matches.push({
                        replaceStart: match.index + timeOffset,
                        end: replaceEnd,
                        label
                    });
                }
            }

            if (match[0].length === 0) this.entryRegex.lastIndex++;
        }

        matches.sort((a, b) => a.replaceStart - b.replaceStart || b.end - a.end);

        const filtered = [];
        let lastEnd = -1;
        for (const item of matches) {
            if (item.replaceStart < lastEnd) continue;
            filtered.push(item);
            lastEnd = item.end;
        }

        return filtered;
    }

    parseZoneAt(text, index) {
        const tail = text.slice(index);
        const leading = (tail.match(/^[\s(]*/) || [""])[0];
        const body = tail.slice(leading.length);

        const offsetMatch = body.match(/^((?:UTC|GMT)(?:\s*[+-]\s*\d{1,2}(?::?\d{2})?)?)/i);
        if (offsetMatch) {
            const zoneInfo = this.parseOffsetZone(offsetMatch[1]);
            if (zoneInfo) {
                return {
                    zoneInfo,
                    end: index + leading.length + offsetMatch[1].length
                };
            }
        }

        const ianaMatch = body.match(/^([A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+)/);
        if (ianaMatch) {
            const zone = ianaMatch[1];
            if (this.isValidTimeZone(zone)) {
                return {
                    zoneInfo: { type: "iana", timeZone: zone },
                    end: index + leading.length + zone.length
                };
            }
        }

        const wordMatch = body.match(/^([A-Za-z]{1,10})/);
        if (!wordMatch) return null;

        const zoneToken = wordMatch[1].replace(/\./g, "").toUpperCase();
        const zoneInfo = this.zoneMap.get(zoneToken);
        if (!zoneInfo) return null;

        return {
            zoneInfo,
            end: index + leading.length + wordMatch[1].length
        };
    }

    parseAdjacentDateAt(text, index) {
        const tail = text.slice(index);
        const match = tail.match(new RegExp(`^[\\s,()\\[\\]-]*(${this.monthDatePattern}|${this.numericDatePattern})\\b`, "i"));
        if (!match) return null;

        const leading = tail.indexOf(match[1]);
        return {
            value: match[1],
            end: index + leading + match[1].length
        };
    }

    parseDateThenZoneAt(text, index) {
        const tail = text.slice(index);
        const dateMatch = tail.match(new RegExp(`^[\\s/,-]*(${this.monthDatePattern}|${this.numericDatePattern})`, "i"));
        if (!dateMatch) return null;

        const dateText = dateMatch[1];
        const dateStart = tail.indexOf(dateText);
        const afterDate = index + dateStart + dateText.length;
        const zoneMatch = this.parseZoneAt(text, afterDate);
        if (!zoneMatch) return null;

        return {
            dateText,
            zoneInfo: zoneMatch.zoneInfo,
            end: zoneMatch.end
        };
    }

    parseOffsetZone(value) {
        const compact = value.replace(/\s+/g, "").toUpperCase();
        const match = compact.match(/^(UTC|GMT)([+-]\d{1,2}(?::?\d{2})?)?$/);
        if (!match) return null;
        if (!match[2]) return { type: "offset", offsetMinutes: 0 };
        const offsetMinutes = this.parseOffset(match[2]);
        if (offsetMinutes == null) return null;
        return { type: "offset", offsetMinutes };
    }

    parseOffset(fragment) {
        const match = fragment.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
        if (!match) return null;
        const sign = match[1] === "-" ? -1 : 1;
        const hours = Number(match[2]);
        const minutes = Number(match[3] || "0");
        if (hours > 23 || minutes > 59) return null;
        return sign * (hours * 60 + minutes);
    }

    parseTime(input) {
        const value = input.trim().replace(/\./g, "").replace(/\s+/g, " ").toLowerCase();

        let match = value.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap]m)$/);
        if (match) {
            let hour = Number(match[1]);
            const minute = Number(match[2] || "0");
            const second = Number(match[3] || "0");
            const meridiem = match[4];

            if (hour < 1 || hour > 12 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
            if (meridiem === "pm" && hour !== 12) hour += 12;
            if (meridiem === "am" && hour === 12) hour = 0;

            return { hour, minute, second };
        }

        match = value.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/);
        if (match) {
            const hour = Number(match[1]);
            const minute = Number(match[2] || "0");
            const second = Number(match[3] || "0");

            if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

            return { hour, minute, second };
        }

        return null;
    }

    parseDate(input, zoneInfo) {
        const cleaned = input.trim().replace(/,/g, "");

        const monthMatch = cleaned.match(
            /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/i
        );
        if (monthMatch) {
            const months = {
                jan: 1, january: 1,
                feb: 2, february: 2,
                mar: 3, march: 3,
                apr: 4, april: 4,
                may: 5,
                jun: 6, june: 6,
                jul: 7, july: 7,
                aug: 8, august: 8,
                sep: 9, sept: 9, september: 9,
                oct: 10, october: 10,
                nov: 11, november: 11,
                dec: 12, december: 12
            };

            const month = months[monthMatch[1].toLowerCase()];
            const day = Number(monthMatch[2]);
            let year = monthMatch[3] ? Number(monthMatch[3]) : null;

            if (!year) {
                const base = this.getCurrentDateParts(zoneInfo);
                year = base.year;
            }

            if (!month || day < 1 || day > 31) return null;
            return { year, month, day };
        }

        const numericMatch = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
        if (numericMatch) {
            const day = Number(numericMatch[1]);
            const month = Number(numericMatch[2]);
            let year = Number(numericMatch[3]);

            if (year < 100) year += year >= 70 ? 1900 : 2000;
            if (month < 1 || month > 12 || day < 1 || day > 31) return null;

            return { year, month, day };
        }

        return this.getCurrentDateParts(zoneInfo);
    }

    convert(dateText, timeText, zoneInfo, explicitDate = Boolean(dateText)) {
        const parsedTime = this.parseTime(timeText);
        if (!parsedTime) return null;

        const sourceDate = dateText ? this.parseDate(dateText, zoneInfo) : this.getCurrentDateParts(zoneInfo);
        if (!sourceDate) return null;

        let utcDate;

        if (zoneInfo.type === "offset") {
            utcDate = new Date(Date.UTC(
                sourceDate.year,
                sourceDate.month - 1,
                sourceDate.day,
                parsedTime.hour,
                parsedTime.minute,
                parsedTime.second || 0
            ) - zoneInfo.offsetMinutes * 60000);
        } else {
            utcDate = this.zonedTimeToUtc(
                zoneInfo.timeZone,
                sourceDate.year,
                sourceDate.month,
                sourceDate.day,
                parsedTime.hour,
                parsedTime.minute,
                parsedTime.second || 0
            );
        }

        if (!(utcDate instanceof Date) || Number.isNaN(utcDate.getTime())) return null;

        const targetZone = this.isValidTimeZone(this.currentZone) ? this.currentZone : this.defaultLocalTimeZone;
        const localDate = this.getZonedParts(utcDate, targetZone);

        const dayShift = this.dayCode(localDate.year, localDate.month, localDate.day) - this.dayCode(sourceDate.year, sourceDate.month, sourceDate.day);

        return {
            display: this.formatLocalTime(utcDate),
            localDateText: explicitDate ? this.formatLocalDate(utcDate) : "",
            dayText: explicitDate ? "" : this.dayShiftLabel(dayShift)
        };
    }

    getCurrentDateParts(zoneInfo) {
        try {
            if (zoneInfo.type === "offset") {
                const now = new Date();
                const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
                const shifted = new Date(utcMs + zoneInfo.offsetMinutes * 60000);
                return {
                    year: shifted.getUTCFullYear(),
                    month: shifted.getUTCMonth() + 1,
                    day: shifted.getUTCDate()
                };
            }

            return this.getZonedParts(new Date(), zoneInfo.timeZone);
        } catch {
            return null;
        }
    }

    getZonedParts(date, timeZone) {
        const formatter = this.getFormatter(
            "parts:" + timeZone,
            () => new Intl.DateTimeFormat("en-CA", {
                timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hourCycle: "h23"
            })
        );

        const values = {};
        for (const part of formatter.formatToParts(date)) {
            if (part.type !== "literal") values[part.type] = part.value;
        }

        return {
            year: Number(values.year),
            month: Number(values.month),
            day: Number(values.day),
            hour: Number(values.hour),
            minute: Number(values.minute),
            second: Number(values.second)
        };
    }

    zonedTimeToUtc(timeZone, year, month, day, hour, minute, second = 0) {
        let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);
        const target = Date.UTC(year, month - 1, day, hour, minute, second);

        for (let i = 0; i < 6; i++) {
            const parts = this.getZonedParts(new Date(utcMillis), timeZone);
            const observed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
            const diff = target - observed;
            utcMillis += diff;
            if (Math.abs(diff) < 1000) break;
        }

        return new Date(utcMillis);
    }

    formatLocalTime(date) {
        const zone = this.isValidTimeZone(this.currentZone) ? this.currentZone : this.defaultLocalTimeZone;
        const formatter = this.getFormatter(
            "local:" + zone,
            () => new Intl.DateTimeFormat(undefined, {
                timeZone: zone,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hourCycle: "h23"
            })
        );
        return formatter.format(date);
    }

    formatLocalDate(date) {
        const zone = this.isValidTimeZone(this.currentZone) ? this.currentZone : this.defaultLocalTimeZone;
        const formatter = this.getFormatter(
            "local-date:" + zone,
            () => new Intl.DateTimeFormat(undefined, {
                timeZone: zone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            })
        );
        return formatter.format(date);
    }

    isValidTimeZone(zone) {
        try {
            new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
            return true;
        } catch {
            return false;
        }
    }

    dayCode(year, month, day) {
        return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
    }

    dayShiftLabel(shift) {
        if (shift === 1) return "tomorrow";
        if (shift === -1) return "yesterday";
        if (shift > 1) return "+" + shift + "d";
        if (shift < -1) return shift + "d";
        return "";
    }

    getFormatter(key, create) {
        if (!this.formatterCache.has(key)) {
            this.formatterCache.set(key, create());
        }
        return this.formatterCache.get(key);
    }
};