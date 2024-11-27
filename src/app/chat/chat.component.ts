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

    displayMessages: {role: string, content: string, images?: string[]}[] = [];
    imagesInputContent: any;
    imagesInput: Record<string, string> = {};
    imagesInputHistory: Record<string, string> = {};
    imagesPreview: string[] = [];
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
        if (!this.userInput.trim() && Object.keys(this.imagesInput).length === 0) return;

        this.addMessage('user', this.userInput, Object.values(this.imagesInput));

        this.loading = true;

        if (!!this.imagesInputContent) {
            const paths = Object.keys(this.imagesInput).join('\n');
            this.userInput = `${this.userInput}\n\npaths:\n${paths}`;
            this.fileInput.nativeElement.value = '';
        }

        for (let imagesInputKey in this.imagesInput) {
            this.imagesInputHistory[imagesInputKey] = this.imagesInput[imagesInputKey];
        }

        this.openAIService.sendMessage(this.userInput, this.imagesInputHistory, this.imagesInputContent);

        this.userInput = '';
        this.imagesInputContent = null;
        this.imagesInput = {};
        this.imagesPreview = [];
    }

    handleImageUpload(event: any) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const imageEncodingObservables = Array.from(files as File[]).map((file: File) => {
            return this.openAIService.encodeImage(file).pipe(
                // Salva nel localStorage la mappa file -> base64
                tap((base64String) => {
                    const fileName = file.name;
                    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                    this.imagesInput[uniqueId + '/' + fileName] = base64String;
                    this.imagesPreview.push(base64String);
                })
            );
        });

        // Codifica tutte le immagini in parallelo
        forkJoin(imageEncodingObservables).subscribe({
            next: (base64images) => {
                const content = base64images.map((url) => ({ type: 'image_url', image_url: { url } }));
                if (!!this.imagesInputContent) {
                    this.imagesInputContent = { role: 'user', content: [...this.imagesInputContent.content, ...content] };
                } else {
                    this.imagesInputContent = { role: 'user', content: content };
                }
            },
            error: (error) => console.error('Errore nel caricamento immagini:', error),
        });

        event.target.value = null;
    }

    removeImage(index: number) {
        const keys = Object.keys(this.imagesInput); // Ottieni tutte le chiavi di imagesInput
        const keyToRemove = keys[index]; // Trova la chiave corrispondente all'indice

        if (keyToRemove) {
            delete this.imagesInput[keyToRemove]; // Rimuovi l'immagine da imagesInput
            this.imagesPreview.splice(index, 1); // Rimuovi l'anteprima dall'array
        }
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

    addMessage(role: string, content: string, images?: string[]): void {
        const atBottom = this.isUserAtBottom(); // Verifica se l'utente è al fondo
        this.displayMessages.push({ role, content, images });

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
            behavior: 'smooth'  // Aggiungi lo scroll fluido
        });
        const handleScroll = () => {
            const isAtBottom = chatMessagesElement.scrollHeight - chatMessagesElement.scrollTop === chatMessagesElement.clientHeight;

            if (isAtBottom) {
                this.isAutoScrolling = false; // Rimuovi il flag solo quando lo scroll è completato
                this.showScrollButton = false; // Nascondi il pulsante quando siamo in fondo
                chatMessagesElement.removeEventListener('scroll', handleScroll); // Rimuovi il listener
            }
        };

        chatMessagesElement.addEventListener('scroll', handleScroll);
    }
}
