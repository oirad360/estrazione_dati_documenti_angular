import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { forkJoin, tap } from 'rxjs';
import { OpenAIService } from '../openai.service';
import { FormsModule } from '@angular/forms';
import { NgClass, NgForOf, NgIf } from '@angular/common';
import { MarkdownComponent, MarkdownModule } from 'ngx-markdown';

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.css'],
    imports: [
        FormsModule,
        NgIf,
        NgForOf,
        MarkdownComponent,
        NgClass
    ],
    standalone: true
})
export class ChatComponent implements OnInit {

    displayMessages: {role: string, content: string, imagesInput?: {filename: string, base64url: string}[]}[] = [];
    imagesInputHistory: Record<string, string> = {};
    imagesInput: {filename: string, base64url: string}[] = [];
    userInput: string = '';
    loading: boolean = false;
    selectedImage: string | null = null; // Immagine selezionata per la modale
    showScrollButton: boolean = false;  // Variabile per controllare la visibilità del bottone
    isAutoScrolling = false;
    @ViewChild('chatMessages') chatMessages!: ElementRef; // Riferimento alla chat
    @ViewChild('fileInput') fileInput: any;

    constructor(private openAIService: OpenAIService) {}

    ngOnInit(): void {
        this.openAIService.sendMessageResponse.subscribe((res) => {
            this.loading = false;
            if (!!res) {
                this.addMessage('assistant', res);
                setTimeout(() => {
                    if (!this.isUserAtBottom()) {
                        this.checkScrollPosition()
                    }
                }, 10); // Permette al DOM di aggiornarsi prima dello scroll
            }
        });
    }

    sendMessage() {
        this.checkScrollPosition()
        if (!this.userInput.trim() && this.imagesInput.length === 0) return;

        this.addMessage('user', this.userInput, this.imagesInput);

        this.loading = true;

        if (this.imagesInput.length > 0) {
            this.userInput = `${this.userInput}\n\npaths:`;
            this.imagesInput.forEach((el) => {
                this.userInput = this.userInput + '\n' + el.filename;
                this.imagesInputHistory[el.filename] = el.base64url;
            })
            this.fileInput.nativeElement.value = '';
        }

        this.openAIService.sendMessage(
            this.userInput,
            this.imagesInputHistory,
            {
                role: 'user',
                content: this.imagesInput.map((imageInput) => ({ type: 'image_url', image_url: { url: imageInput.base64url } }))
            }
        );

        this.userInput = '';
        this.imagesInput = [];
    }

    handleImageUpload(event: any) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const imageEncodingObservables = Array.from(files as File[]).map((file: File) => {
            return this.openAIService.encodeImage(file);
        });

        // Codifica tutte le immagini in parallelo
        forkJoin(imageEncodingObservables).subscribe({
            next: (res: {filename: string, base64url: string}[]) => {
                this.imagesInput = [...this.imagesInput, ...res]
            },
            error: (error) => console.error('Errore nel caricamento immagini:', error),
        });

        event.target.value = null;
    }

    removeImage(filename: string) {
        this.imagesInput = this.imagesInput.filter((el) => el.filename !== filename);
    }

    openImageModal(image: string) {
        this.selectedImage = image;
    }

    closeImageModal() {
        this.selectedImage = null;
    }

    checkScrollPosition() {
        const chatMessagesElement = this.chatMessages.nativeElement;
        const isAtBottom = chatMessagesElement.scrollHeight - chatMessagesElement.scrollTop === chatMessagesElement.clientHeight;
        this.showScrollButton = !isAtBottom; // Mostra il bottone se non siamo in fondo
    }

    isUserAtBottom(): boolean {
        const chatMessagesElement = this.chatMessages.nativeElement;
        return (
            chatMessagesElement.scrollHeight - chatMessagesElement.scrollTop === chatMessagesElement.clientHeight
        );
    }

    addMessage(role: string, content: string, imagesInput?: {filename: string, base64url: string}[]): void {
        const atBottom = this.isUserAtBottom(); // Verifica se l'utente è al fondo
        this.displayMessages.push({ role, content, imagesInput });

        if (atBottom) {
            // Effettua lo scroll automatico
            setTimeout(() => {
                this.scrollToBottom();
            }, 10); // Permette al DOM di aggiornarsi prima dello scroll
        }
    }

    scrollToBottom() {
        this.isAutoScrolling = true
        const chatMessagesElement = this.chatMessages.nativeElement;
        chatMessagesElement.scrollTo({
            top: chatMessagesElement.scrollHeight,
            behavior: 'smooth'
        });
        const handleScroll = () => {
            const isAtBottom = chatMessagesElement.scrollHeight - chatMessagesElement.scrollTop === chatMessagesElement.clientHeight;

            if (isAtBottom) {
                this.isAutoScrolling = false;
                this.showScrollButton = false;
                chatMessagesElement.removeEventListener('scroll', handleScroll);
            }
        };

        chatMessagesElement.addEventListener('scroll', handleScroll);
    }

    handleKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            // Blocca il comportamento predefinito di andare a capo
            event.preventDefault();
            // Invia il messaggio
            this.sendMessage();
        }
    }

}
