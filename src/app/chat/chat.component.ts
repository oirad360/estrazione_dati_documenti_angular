import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
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

    userInput: string = '';
    loading: boolean = false;

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

        this.openAIService
            .sendMessage(this.userInput)
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

        const imageEncodingObservables = Array.from(files as File[]).map((file: File) =>
            this.openAIService.encodeImage(file)
        );

        // Codifica tutte le immagini in parallelo
        forkJoin(imageEncodingObservables).subscribe({
            next: (imageUrls) => {
                const formattedImages = imageUrls.map((url) => ({ type: 'image_url', image_url: { url } }));
                // this.messages.push({ role: 'user', content: formattedImages });
            },
            error: (error) => console.error('Errore nel caricamento immagini:', error),
            complete: () => {
                this.loading = false;
            },
        });
    }

}
