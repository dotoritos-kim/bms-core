/**
 * Returns reader options based on the file name.
 * @param {string} filename the file name
 */
export function getReaderOptionsFromFilename(filename: string) {
    let forceEncoding;
    if (filename.match(/\.sjis\.\w+$/i)) {
        forceEncoding = 'Shift-JIS';
    }
    if (filename.match(/\.euc_kr\.\w+$/i)) {
        forceEncoding = 'EUC-KR';
    }
    if (filename.match(/\.utf8\.\w+$/i)) {
        forceEncoding = 'UTF-8';
    }
    if (filename.match(/\.win1251\.\w+$/i)) {
        forceEncoding = 'windows-1251';
    }
    return { forceEncoding };
}
