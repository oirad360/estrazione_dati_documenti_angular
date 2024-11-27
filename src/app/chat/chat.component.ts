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
    @ViewChild('chatMessages') chatMessages!: ElementRef; // Riferimento alla chat
    @ViewChild('fileInput') fileInput: any;

    constructor(private openAIService: OpenAIService) {}

    ngOnInit(): void {
        this.openAIService.sendMessageResponse.subscribe((res) => {
            this.loading = false;
            if (!!res) {
                this.displayMessages.push({ role: 'assistant', content: res });
                this.checkScrollPosition()
            }
        });
    }

    sendMessage() {
        this.checkScrollPosition()
        if (!this.userInput.trim() && Object.keys(this.imagesInput).length === 0) return;

        const userMessage = {
            role: 'user',
            content: this.userInput,
            images: Object.values(this.imagesInput) // Array di immagini in base64
        };
        this.displayMessages.push(userMessage);

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

    scrollToBottom() {
        const chatMessagesElement = this.chatMessages.nativeElement;
        chatMessagesElement.scrollTo({
            top: chatMessagesElement.scrollHeight,
            behavior: 'smooth'  // Aggiungi lo scroll fluido
        });
    }
}
