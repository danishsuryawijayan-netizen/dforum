import base64
import re
import sys
from datetime import datetime

import markdown
import requests
import yaml
from PyQt6 import QtCore, QtGui, QtWidgets


CATEGORIES = (
    "WORM & BOTNET",
    "CRYPTOMINER",
    "APT & BACKDOOR",
    "BERITA",
)
REPOSITORY = "danishsuryawijayan-netizen/dforum"
BRANCH = "master"
API_ROOT = f"https://api.github.com/repos/{REPOSITORY}"
CONTENT_FOLDERS = {"artikel", "berita"}


class GitHubManager:
    def __init__(self, token):
        self.token = token.strip()
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    @staticmethod
    def _raise_for_github_error(response):
        try:
            result = response.json()
        except ValueError:
            result = {}
        message = result.get("message") if isinstance(result, dict) else None
        if not message:
            message = response.text.strip() or f"HTTP {response.status_code}"
        raise RuntimeError(f"GitHub API: {message}")

    def fetch_files(self, folder):
        if folder not in CONTENT_FOLDERS:
            raise ValueError("Folder hanya boleh artikel atau berita.")

        response = requests.get(
            f"{API_ROOT}/contents/{folder}",
            headers=self.headers,
            params={"ref": BRANCH},
            timeout=30,
        )
        if not response.ok:
            self._raise_for_github_error(response)

        entries = response.json()
        if not isinstance(entries, list):
            raise RuntimeError(f"GitHub tidak mengembalikan daftar file untuk {folder}.")
        return sorted(
            entry["name"]
            for entry in entries
            if entry.get("type") == "file"
            and isinstance(entry.get("name"), str)
            and entry["name"].lower().endswith(".md")
        )

    def publish_article(self, folder, filename, content):
        if folder not in CONTENT_FOLDERS:
            raise ValueError("Folder hanya boleh artikel atau berita.")
        if (
            not filename.lower().endswith(".md")
            or "/" in filename
            or "\\" in filename
            or filename in {".", ".."}
        ):
            raise ValueError("Nama file artikel tidak valid.")

        file_url = f"{API_ROOT}/contents/{folder}/{filename}"
        existing = requests.get(
            file_url,
            headers=self.headers,
            params={"ref": BRANCH},
            timeout=30,
        )
        sha = None
        if existing.status_code == 200:
            existing_data = existing.json()
            sha = existing_data.get("sha") if isinstance(existing_data, dict) else None
            if not sha:
                raise RuntimeError("GitHub tidak mengembalikan SHA untuk file yang akan diperbarui.")
        elif existing.status_code != 404:
            self._raise_for_github_error(existing)

        payload = {
            "message": f"{'Perbarui' if sha else 'Publikasikan'} {folder}/{filename}",
            "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
            "branch": BRANCH,
        }
        if sha:
            payload["sha"] = sha

        response = requests.put(
            file_url,
            headers=self.headers,
            json=payload,
            timeout=60,
        )
        if not response.ok:
            self._raise_for_github_error(response)
        result = response.json()
        content_data = result.get("content", {}) if isinstance(result, dict) else {}
        return content_data.get("html_url") or f"https://github.com/{REPOSITORY}/blob/{BRANCH}/{folder}/{filename}"


class ApiSignals(QtCore.QObject):
    result = QtCore.pyqtSignal(object)
    error = QtCore.pyqtSignal(str)
    finished = QtCore.pyqtSignal()


class ApiWorker(QtCore.QRunnable):
    def __init__(self, function):
        super().__init__()
        self.function = function
        self.signals = ApiSignals()

    @QtCore.pyqtSlot()
    def run(self):
        try:
            self.signals.result.emit(self.function())
        except Exception as error:
            self.signals.error.emit(str(error))
        finally:
            self.signals.finished.emit()


class MainWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("DForum Desktop Publisher")
        self.resize(1200, 800)
        self.setMinimumSize(900, 620)
        self._thread_pool = QtCore.QThreadPool.globalInstance()
        self._workers = set()
        self._refresh_in_progress = False
        self._publish_in_progress = False
        self._build_ui()
        self._apply_styles()
        QtCore.QTimer.singleShot(0, self.refresh_articles)

    def _build_ui(self):
        central = QtWidgets.QWidget()
        central.setObjectName("centralWidget")
        self.setCentralWidget(central)

        page_layout = QtWidgets.QVBoxLayout(central)
        page_layout.setContentsMargins(26, 22, 26, 22)
        page_layout.setSpacing(18)

        masthead = QtWidgets.QHBoxLayout()
        masthead.setSpacing(12)
        title_block = QtWidgets.QVBoxLayout()
        title_block.setSpacing(3)
        title = QtWidgets.QLabel("DFORUM")
        title.setObjectName("mastheadTitle")
        subtitle = QtWidgets.QLabel("DESKTOP PUBLISHER  /  EDITORIAL WORKSPACE")
        subtitle.setObjectName("mastheadSubtitle")
        title_block.addWidget(title)
        title_block.addWidget(subtitle)
        masthead.addLayout(title_block)
        masthead.addStretch(1)
        self.token_input = QtWidgets.QLineEdit()
        self.token_input.setObjectName("tokenInput")
        self.token_input.setPlaceholderText("Masukkan GitHub Token (ghp_...)")
        self.token_input.setEchoMode(QtWidgets.QLineEdit.EchoMode.Password)
        self.token_input.setMinimumWidth(300)
        self.token_input.setMaximumWidth(390)
        self.token_input.setClearButtonEnabled(True)
        self.token_input.editingFinished.connect(self.refresh_articles)
        masthead.addWidget(self.token_input)
        phase_label = QtWidgets.QLabel("FASE 2 · GITHUB API")
        phase_label.setObjectName("phaseBadge")
        masthead.addWidget(phase_label, alignment=QtCore.Qt.AlignmentFlag.AlignVCenter)
        page_layout.addLayout(masthead)

        self.splitter = QtWidgets.QSplitter(QtCore.Qt.Orientation.Horizontal)
        self.splitter.setChildrenCollapsible(False)
        self.splitter.setHandleWidth(8)
        page_layout.addWidget(self.splitter, stretch=1)

        self._build_sidebar()
        self._build_editor()
        self.splitter.setSizes([290, 850])
        self.statusBar().showMessage("Siap untuk menulis artikel.")

    def _build_sidebar(self):
        sidebar = QtWidgets.QWidget()
        sidebar.setObjectName("sidebar")
        sidebar.setMinimumWidth(230)
        sidebar_layout = QtWidgets.QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(18, 18, 18, 18)
        sidebar_layout.setSpacing(12)

        sidebar_title = QtWidgets.QLabel("ARSIP ARTIKEL")
        sidebar_title.setObjectName("sectionTitle")
        sidebar_layout.addWidget(sidebar_title)

        self.article_list = QtWidgets.QListWidget()
        self.article_list.setObjectName("articleList")
        self.article_list.setSelectionMode(
            QtWidgets.QAbstractItemView.SelectionMode.SingleSelection
        )
        self.article_list.setToolTip(
            "Daftar artikel akan dimuat dari GitHub pada fase berikutnya."
        )
        sidebar_layout.addWidget(self.article_list, stretch=1)

        empty_hint = QtWidgets.QLabel(
            "Belum ada daftar artikel.\nGunakan tombol Muat Artikel untuk memuat arsip."
        )
        empty_hint.setObjectName("emptyHint")
        empty_hint.setWordWrap(True)
        sidebar_layout.addWidget(empty_hint)

        sidebar_actions = QtWidgets.QHBoxLayout()
        sidebar_actions.setSpacing(8)
        self.load_button = QtWidgets.QPushButton("Muat Artikel")
        self.load_button.setObjectName("secondaryButton")
        self.delete_button = QtWidgets.QPushButton("Hapus Artikel")
        self.delete_button.setObjectName("quietButton")
        sidebar_actions.addWidget(self.load_button, stretch=1)
        sidebar_actions.addWidget(self.delete_button)
        sidebar_layout.addLayout(sidebar_actions)

        self.load_button.clicked.connect(self.refresh_articles)
        self.delete_button.clicked.connect(
            lambda: self._show_phase_notice("Hapus Artikel")
        )
        self.splitter.addWidget(sidebar)

    def _build_editor(self):
        editor_panel = QtWidgets.QWidget()
        editor_panel.setObjectName("editorPanel")
        editor_layout = QtWidgets.QVBoxLayout(editor_panel)
        editor_layout.setContentsMargins(24, 20, 24, 20)
        editor_layout.setSpacing(14)

        editor_header = QtWidgets.QHBoxLayout()
        editor_title = QtWidgets.QLabel("EDITOR ARTIKEL")
        editor_title.setObjectName("sectionTitle")
        editor_header.addWidget(editor_title)
        editor_header.addStretch(1)
        editor_layout.addLayout(editor_header)

        fields = QtWidgets.QGridLayout()
        fields.setHorizontalSpacing(14)
        fields.setVerticalSpacing(12)
        title_label = QtWidgets.QLabel("Judul Artikel")
        self.title_input = QtWidgets.QLineEdit()
        self.title_input.setObjectName("titleInput")
        self.title_input.setPlaceholderText("Masukkan judul artikel")
        fields.addWidget(title_label, 0, 0)
        fields.addWidget(self.title_input, 0, 1)

        category_label = QtWidgets.QLabel("Kategori")
        self.category_input = QtWidgets.QComboBox()
        self.category_input.addItems(CATEGORIES)
        fields.addWidget(category_label, 1, 0)
        fields.addWidget(self.category_input, 1, 1)
        fields.setColumnStretch(1, 1)
        editor_layout.addLayout(fields)

        self.editor_toolbar = QtWidgets.QToolBar("Pemformatan Artikel")
        self.editor_toolbar.setObjectName("editorToolbar")
        self.editor_toolbar.setMovable(False)
        self.editor_toolbar.setFloatable(False)
        self.editor_toolbar.setToolButtonStyle(
            QtCore.Qt.ToolButtonStyle.ToolButtonTextOnly
        )

        self.bold_action = QtGui.QAction("Bold", self)
        self.bold_action.setCheckable(True)
        self.bold_action.setShortcut(QtGui.QKeySequence("Ctrl+B"))
        self.bold_action.setToolTip("Tebal (Ctrl+B)")
        self.bold_action.toggled.connect(self._set_bold)
        self.editor_toolbar.addAction(self.bold_action)

        self.italic_action = QtGui.QAction("Italic", self)
        self.italic_action.setCheckable(True)
        self.italic_action.setShortcut(QtGui.QKeySequence("Ctrl+I"))
        self.italic_action.setToolTip("Miring (Ctrl+I)")
        self.italic_action.toggled.connect(self._set_italic)
        self.editor_toolbar.addAction(self.italic_action)

        self.editor_toolbar.addSeparator()
        self.heading_action = QtGui.QAction("Heading", self)
        self.heading_action.setToolTip("Format teks sebagai subjudul")
        self.heading_action.triggered.connect(self._format_heading)
        self.editor_toolbar.addAction(self.heading_action)
        editor_layout.addWidget(self.editor_toolbar)

        self.body_editor = QtWidgets.QTextEdit()
        self.body_editor.setObjectName("bodyEditor")
        self.body_editor.setAcceptRichText(True)
        self.body_editor.setPlaceholderText(
            "Tulis isi artikel di sini. Gunakan toolbar untuk memformat teks..."
        )
        self.body_editor.setTabStopDistance(
            QtGui.QFontMetricsF(self.body_editor.font()).horizontalAdvance(" ") * 4
        )
        editor_layout.addWidget(self.body_editor, stretch=1)

        footer = QtWidgets.QHBoxLayout()
        footer.setSpacing(10)
        self.upload_button = QtWidgets.QPushButton("Upload Gambar")
        self.upload_button.setObjectName("secondaryButton")
        self.history_button = QtWidgets.QPushButton("Lihat History")
        self.history_button.setObjectName("quietButton")
        footer.addWidget(self.upload_button)
        footer.addWidget(self.history_button)
        footer.addStretch(1)

        self.publish_button = QtWidgets.QPushButton("PUBLISH / SIMPAN")
        self.publish_button.setObjectName("publishButton")
        self.publish_button.setMinimumHeight(46)
        self.publish_button.setMinimumWidth(210)
        footer.addWidget(self.publish_button)
        editor_layout.addLayout(footer)

        self.upload_button.clicked.connect(
            lambda: self._show_phase_notice("Upload Gambar")
        )
        self.history_button.clicked.connect(
            lambda: self._show_phase_notice("Lihat History")
        )
        self.publish_button.clicked.connect(self.publish_current_article)
        self.splitter.addWidget(editor_panel)

    def _set_bold(self, enabled):
        text_format = QtGui.QTextCharFormat()
        weight = QtGui.QFont.Weight.Bold if enabled else QtGui.QFont.Weight.Normal
        text_format.setFontWeight(weight)
        self.body_editor.mergeCurrentCharFormat(text_format)
        self.body_editor.setFocus()

    def _set_italic(self, enabled):
        text_format = QtGui.QTextCharFormat()
        text_format.setFontItalic(enabled)
        self.body_editor.mergeCurrentCharFormat(text_format)
        self.body_editor.setFocus()

    def _format_heading(self):
        cursor = self.body_editor.textCursor()
        if not cursor.hasSelection():
            cursor.select(QtGui.QTextCursor.SelectionType.LineUnderCursor)
        text_format = QtGui.QTextCharFormat()
        text_format.setFontPointSize(20)
        text_format.setFontWeight(QtGui.QFont.Weight.Bold)
        cursor.mergeCharFormat(text_format)
        self.body_editor.mergeCurrentCharFormat(text_format)
        self.body_editor.setTextCursor(cursor)
        self.body_editor.setFocus()

    def _show_phase_notice(self, feature):
        self.statusBar().showMessage(
            f"{feature}: antarmuka tersedia; fungsi ini akan diaktifkan pada fase berikutnya.",
            5000,
        )

    def _start_worker(self, function, on_result, on_error):
        worker = ApiWorker(function)
        self._workers.add(worker)
        worker.signals.result.connect(on_result)
        worker.signals.error.connect(on_error)
        worker.signals.finished.connect(
            lambda worker=worker: self._workers.discard(worker)
        )
        self._thread_pool.start(worker)

    def refresh_articles(self):
        if self._refresh_in_progress:
            return
        token = self.token_input.text().strip()
        if not token:
            self.statusBar().showMessage(
                "Masukkan GitHub Token, lalu tekan Enter atau Muat Artikel.",
                6000,
            )
            return

        self._refresh_in_progress = True
        self.load_button.setEnabled(False)
        self.statusBar().showMessage("Memuat daftar artikel dari GitHub...")
        manager = GitHubManager(token)

        def fetch_all_folders():
            return {
                folder: manager.fetch_files(folder)
                for folder in ("artikel", "berita")
            }

        self._start_worker(
            fetch_all_folders,
            self._show_article_files,
            self._refresh_failed,
        )

    def _show_article_files(self, files_by_folder):
        self.article_list.clear()
        total = 0
        for folder in ("artikel", "berita"):
            for filename in files_by_folder.get(folder, []):
                item = QtWidgets.QListWidgetItem(f"[{folder.upper()}] {filename}")
                item.setData(QtCore.Qt.ItemDataRole.UserRole, f"{folder}/{filename}")
                self.article_list.addItem(item)
                total += 1
        self._refresh_in_progress = False
        self.load_button.setEnabled(True)
        self.statusBar().showMessage(f"{total} artikel dimuat dari GitHub.", 5000)

    def _refresh_failed(self, message):
        self._refresh_in_progress = False
        self.load_button.setEnabled(True)
        self.statusBar().showMessage("Gagal memuat artikel dari GitHub.", 5000)
        QtWidgets.QMessageBox.warning(self, "Gagal Memuat Artikel", message)

    def publish_current_article(self):
        if self._publish_in_progress:
            return

        token = self.token_input.text().strip()
        title = self.title_input.text().strip()
        category = self.category_input.currentText().strip()
        body = self.body_editor.document().toMarkdown().strip()
        if not token or not title or not body:
            QtWidgets.QMessageBox.warning(
                self,
                "Data Belum Lengkap",
                "GitHub Token, judul, dan isi artikel wajib diisi.",
            )
            return

        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "artikel-baru"
        filename = f"{slug}.md"
        folder = "berita" if category == "BERITA" else "artikel"
        date = datetime.now().astimezone().isoformat(timespec="seconds")
        frontmatter = yaml.safe_dump(
            {
                "title": title,
                "date": date,
                "category": category,
            },
            allow_unicode=True,
            sort_keys=False,
        )
        content = f"---\n{frontmatter}---\n\n{body}\n"
        manager = GitHubManager(token)

        self._publish_in_progress = True
        self.publish_button.setEnabled(False)
        self.statusBar().showMessage(f"Menyimpan {folder}/{filename} ke GitHub...")
        self._start_worker(
            lambda: manager.publish_article(folder, filename, content),
            lambda url: self._publish_succeeded(folder, filename, url),
            self._publish_failed,
        )

    def _publish_succeeded(self, folder, filename, url):
        self._publish_in_progress = False
        self.publish_button.setEnabled(True)
        self.statusBar().showMessage(f"Berhasil menyimpan {folder}/{filename}.", 6000)
        QtWidgets.QMessageBox.information(
            self,
            "Berhasil Publish!",
            f"Artikel berhasil disimpan di {folder}/{filename}.\n\n{url}",
        )
        self.refresh_articles()

    def _publish_failed(self, message):
        self._publish_in_progress = False
        self.publish_button.setEnabled(True)
        self.statusBar().showMessage("Gagal menyimpan artikel ke GitHub.", 5000)
        QtWidgets.QMessageBox.critical(self, "Gagal Publish", message)

    def _apply_styles(self):
        self.setStyleSheet(
            """
            QMainWindow, QWidget#centralWidget {
                background: #f4f6f9;
                color: #202938;
                font-family: 'Segoe UI', 'Arial', sans-serif;
                font-size: 10pt;
            }
            QLabel#mastheadTitle {
                color: #172b4d;
                font-size: 24pt;
                font-weight: 800;
                letter-spacing: 2px;
            }
            QLabel#mastheadSubtitle, QLabel#emptyHint {
                color: #758195;
                font-size: 9pt;
            }
            QLabel#phaseBadge {
                color: #365a8c;
                background: #e5edf8;
                border: 1px solid #d1deef;
                border-radius: 12px;
                padding: 7px 12px;
                font-size: 8pt;
                font-weight: 700;
            }
            QWidget#sidebar, QWidget#editorPanel {
                background: #ffffff;
                border: 1px solid #e0e5ec;
                border-radius: 10px;
            }
            QLabel#sectionTitle {
                color: #3c4b61;
                font-size: 9pt;
                font-weight: 700;
                letter-spacing: 1px;
            }
            QSplitter::handle { background: transparent; }
            QSplitter::handle:hover {
                background: #dbe5f1;
                border-radius: 3px;
            }
            QListWidget, QLineEdit, QComboBox, QTextEdit {
                background: #fbfcfe;
                border: 1px solid #d9e0e8;
                border-radius: 6px;
                padding: 8px 10px;
                selection-background-color: #dce9fb;
                selection-color: #172b4d;
            }
            QListWidget { padding: 5px; outline: 0; }
            QListWidget::item { padding: 11px 10px; border-radius: 5px; }
            QListWidget::item:selected {
                color: #244b7a;
                background: #eaf1fb;
            }
            QLineEdit:focus, QComboBox:focus, QTextEdit:focus {
                border: 1px solid #6488b8;
                background: #ffffff;
            }
            QToolBar#editorToolbar {
                background: #f8fafd;
                border: 1px solid #e0e5ec;
                border-radius: 6px;
                spacing: 5px;
                padding: 5px;
            }
            QToolBar#editorToolbar QToolButton {
                color: #34445b;
                background: transparent;
                border: 0;
                border-radius: 4px;
                padding: 7px 11px;
                font-weight: 600;
            }
            QToolBar#editorToolbar QToolButton:hover,
            QToolBar#editorToolbar QToolButton:checked {
                color: #214d82;
                background: #e4edf9;
            }
            QPushButton {
                color: #34445b;
                background: #ffffff;
                border: 1px solid #ccd5e0;
                border-radius: 6px;
                padding: 9px 13px;
                font-weight: 600;
            }
            QPushButton:hover { background: #f0f4f9; border-color: #aebdce; }
            QPushButton:pressed { background: #e4eaf2; }
            QPushButton#secondaryButton {
                color: #2d5687;
                border-color: #c7d6e8;
                background: #f5f8fc;
            }
            QPushButton#quietButton {
                color: #687588;
                background: transparent;
                border-color: transparent;
            }
            QPushButton#publishButton {
                color: #ffffff;
                background: #315f96;
                border: 1px solid #315f96;
                font-size: 10pt;
                font-weight: 700;
                letter-spacing: 0.5px;
            }
            QPushButton#publishButton:hover {
                background: #264f81;
                border-color: #264f81;
            }
            QStatusBar { color: #66758a; background: #f4f6f9; }
            """
        )


def main():
    app = QtWidgets.QApplication(sys.argv)
    app.setDesktopFileName("dforum_cms")
    app.setWindowIcon(QtGui.QIcon("/home/dennis/.local/share/icons/hicolor/512x512/apps/dforum-publisher.png"))
    app.setStyle("Fusion")
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
