import { Component, OnInit, ViewChild } from '@angular/core';
import { forkJoin, tap } from 'rxjs';
import { OpenAIService } from '../openai.service';
import { FormsModule } from '@angular/forms';
import { NgForOf, NgIf } from '@angular/common';

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.css'],
    imports: [
        FormsModule,
        NgIf,
        NgForOf
    ],
    standalone: true
})
export class ChatComponent implements OnInit {

    displayMessages: any[] = []
    images: any;
    userInput: string = '';
    loading: boolean = false;
    @ViewChild('fileInput') fileInput: any;

    constructor(private openAIService: OpenAIService) {}

    ngOnInit(): void {
        this.openAIService.sendMessageResponse.subscribe((res) => {
            if (!!res) {
                this.displayMessages.push({ role: 'assistant', content: res })
            }
        })
    }

    sendMessage() {
        if (!this.userInput.trim()) return;

        this.displayMessages.push({ role: 'user', content: this.userInput });
        this.loading = true;

        if (!!this.images) {
            const paths = Object.keys(JSON.parse(localStorage.getItem('estrazione_dati')??'')).join('\n');
            this.userInput = `${this.userInput}\n\npaths:\n${paths}`;
            this.fileInput.nativeElement.value = '';
        }


        this.openAIService
            .sendMessage(this.userInput, this.images)
            // .pipe(
            //     catchError((error) => {
            //         console.error('Errore nella risposta:', error);
            //         return of({ choices: [{ message: { role: 'assistant', content: 'Errore nel completamento' } }] });
            //     })
            // )
            // .subscribe((response) => {
            //     // this.messages.push(response.choices[0].message);
            //     if (response.choices[0].message.tool_calls) {
            //         const tool_call = response.choices[0].message.tool_calls[0]
            //         const argumentss = tool_call.function.arguments
            //     }
            //     this.loading = false;
            // });
        this.userInput = '';
    }

    handleImageUpload(event: any) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        this.loading = true;

        // Mappa per salvare i dati nel localStorage
        const localStorageMap: Record<string, string> = {};
        localStorage.removeItem('estrazione_dati')

        const imageEncodingObservables = Array.from(files as File[]).map((file: File) => {
            return this.openAIService.encodeImage(file).pipe(
                // Salva nel localStorage la mappa file -> base64
                tap((base64String) => {
                    const fileName = file.name;
                    localStorageMap[fileName] = base64String;
                })
            );
        });

        // Codifica tutte le immagini in parallelo
        forkJoin(imageEncodingObservables).subscribe({
            next: (imageUrls) => {
                const formattedImages = imageUrls.map((url) => ({ type: 'image_url', image_url: { url } }));
                this.images = { role: 'user', content: formattedImages };
                localStorage.setItem('estrazione_dati', JSON.stringify(localStorageMap));
            },
            error: (error) => console.error('Errore nel caricamento immagini:', error),
            complete: () => {
                this.loading = false;
            },
        });
    }


}
