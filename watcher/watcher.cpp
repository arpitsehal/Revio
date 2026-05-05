#include <windows.h>
#include <iostream>
#include <string>
#include <sstream>

std::string wideToUtf8(const std::wstring& wide) {
    if (wide.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), (int)wide.size(), nullptr, 0, nullptr, nullptr);
    std::string result(size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), (int)wide.size(), &result[0], size, nullptr, nullptr);
    return result;
}

std::string escapeJson(const std::string& s) {
    std::string r;
    for (unsigned char c : s) {
        if (c == '\\') r += "\\\\";
        else if (c == '"') r += "\\\"";
        else if (c == '\n') r += "\\n";
        else if (c == '\r') r += "\\r";
        else if (c == '\t') r += "\\t";
        else r += c;
    }
    return r;
}

void watchDirectory(const std::wstring& path) {
    HANDLE hDir = CreateFileW(
        path.c_str(),
        FILE_LIST_DIRECTORY,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED,
        NULL
    );

    if (hDir == INVALID_HANDLE_VALUE) {
        DWORD err = GetLastError();
        std::cout << "{\"error\":\"Cannot open directory, code:" << err << "\"}" << std::endl;
        return;
    }

    BYTE buffer[65536];
    DWORD bytesReturned = 0;
    OVERLAPPED overlapped = {};
    overlapped.hEvent = CreateEvent(NULL, FALSE, FALSE, NULL);

    if (!overlapped.hEvent) {
        CloseHandle(hDir);
        return;
    }

    // Signal ready
    std::cout << "{\"status\":\"ready\"}" << std::endl;
    std::cout.flush();

    while (true) {
        BOOL result = ReadDirectoryChangesW(
            hDir,
            buffer,
            sizeof(buffer),
            TRUE,
            FILE_NOTIFY_CHANGE_FILE_NAME |
            FILE_NOTIFY_CHANGE_DIR_NAME  |
            FILE_NOTIFY_CHANGE_LAST_WRITE|
            FILE_NOTIFY_CHANGE_SIZE,
            NULL,
            &overlapped,
            NULL
        );

        if (!result) {
            DWORD err = GetLastError();
            if (err != ERROR_IO_PENDING) break;
        }

        DWORD wait = WaitForSingleObject(overlapped.hEvent, INFINITE);
        if (wait != WAIT_OBJECT_0) break;
        if (!GetOverlappedResult(hDir, &overlapped, &bytesReturned, FALSE)) break;
        if (bytesReturned == 0) continue;

        FILE_NOTIFY_INFORMATION* fni = (FILE_NOTIFY_INFORMATION*)buffer;
        do {
            std::wstring filename(fni->FileName, fni->FileNameLength / sizeof(WCHAR));
            std::string utf8path = wideToUtf8(filename);
            for (auto& c : utf8path) if (c == '\\') c = '/';

            std::string action;
            switch (fni->Action) {
                case FILE_ACTION_ADDED:            action = "created"; break;
                case FILE_ACTION_REMOVED:          action = "deleted"; break;
                case FILE_ACTION_MODIFIED:         action = "modified"; break;
                case FILE_ACTION_RENAMED_OLD_NAME: action = "renamed_old"; break;
                case FILE_ACTION_RENAMED_NEW_NAME: action = "renamed_new"; break;
                default:                           action = "unknown"; break;
            }

            std::cout << "{\"action\":\"" << action << "\",\"path\":\"" << escapeJson(utf8path) << "\"}" << std::endl;
            std::cout.flush();

            if (fni->NextEntryOffset == 0) break;
            fni = (FILE_NOTIFY_INFORMATION*)((BYTE*)fni + fni->NextEntryOffset);
        } while (true);
    }

    CloseHandle(overlapped.hEvent);
    CloseHandle(hDir);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "{\"error\":\"Usage: watcher.exe <directory>\"}" << std::endl;
        return 1;
    }
    // Convert UTF-8/ANSI path to wide string
    int wlen = MultiByteToWideChar(CP_ACP, 0, argv[1], -1, NULL, 0);
    std::wstring watchPath(wlen - 1, L'\0');
    MultiByteToWideChar(CP_ACP, 0, argv[1], -1, &watchPath[0], wlen);
    watchDirectory(watchPath);
    return 0;
}
