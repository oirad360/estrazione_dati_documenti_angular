import { Injectable } from '@angular/core';
import { BehaviorSubject, from, Observable } from 'rxjs';
import OpenAI from 'openai';
import { environment } from '../environment';
// import {
//     ChatCompletion,
//     ChatCompletionContentPartImage,
//     ChatCompletionMessageParam,
//     ChatCompletionTool
// } from 'openai/src/resources/chat/completions';


@Injectable({
    providedIn: 'root',
})
export class OpenAIService {
    private client = new OpenAI({apiKey: environment.openai_apikey, dangerouslyAllowBrowser: true});
    private messages: any[]/*ChatCompletionMessageParam[]*/ = [
        {
            role: 'system',
            content: 'Riceverai una o più immagini, analizza il contenuto delle immagini e indica se rappresentano una carta di identità elettronica o una patente, quindi chiama la funzione adatta per estrarne i dati.',
        },
    ];
    private tools: any[]/*ChatCompletionTool[]*/ = [
        {
            type: 'function',
            function: {
                name: 'estrazioneDatiCartaDiIdentitaElettronica',
                description: 'Estrae i dati da due foto fronte e retro di una carta di identità elettornica utilizzando OCR. Se ricevi in input solo il fronte o solo il retro, avvisa che è necessario averli entrambi.',
                strict: true,
                parameters: {
                    type: 'object',
                    required: [
                        'paths'
                    ],
                    properties: {
                        'paths': {
                            type: 'array',
                            description: 'Lista dei paths delle foto da cui estrarre i dati',
                            items: {
                                type: 'string',
                                description: 'path di una foto'
                            }
                        }
                    },
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'estrazioneDatiPatente',
                description: 'Estrae i dati da una foto del fronte di una patente utilizzando OCR',
                strict: true,
                parameters: {
                    type: 'object',
                    required: [
                        'paths'
                    ],
                    properties: {
                        'paths': {
                            type: 'array',
                            description: 'Lista dei paths delle foto da cui estrarre i dati',
                            items: {
                                type: 'string',
                                description: 'path di una foto'
                            }
                        }
                    },
                    additionalProperties: false
                }
            }
        }
    ];
    sendMessageResponse: BehaviorSubject<String | null> = new BehaviorSubject<String | null>('')

    constructor() {
    }

    // Metodo per inviare messaggi e immagini
    sendMessage(userInput: string, images?: any) {
        if (!!images)
            this.messages.push(images)
        this.messages.push({role: 'user', content: userInput})
        console.log(this.messages)
        from(
            this.client.chat.completions.create({
                model: 'gpt-4o-2024-08-06',
                messages: this.messages,
                tools: this.tools
            })
        ).subscribe((res /*ChatCompletion*/) => {
            this.sendMessageResponse.next(res.choices[0].message.content)
        })
    }

    estrazioneDatiPatente(urls: String[]) {
        return from(
            this.client.chat.completions.create({
                model: 'ft:gpt-4o-2024-08-06:blue-financial-services-it::ARK5a1Au',
                messages: [
                    {
                        role: 'system',
                        content: 'Agisci come un OCR per leggere i seguenti dati dalla foto che riceverai in input: \'Cognome\', \'Nome\', \'Data di nascita\', \'Luogo di nascita\', \'Data emissione\', \'Data di scadenza\', \'Numero documento\', \'Rilasciata da\'. Se non trovi un valore, non devi dedurlo ma devi indicare che non è stato possibile recuperarlo.'
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(urls.map((url) => ({ type: 'image_url', image_url: { url } })))/* as ChatCompletionContentPartImage[],*/
                    },
                ],
            })
        );
    }

    estrazioneDatiCartaDiIdentitaElettronica(urls: String[]) {
        const content = urls.map((url) => ({ type: 'image_url', image_url: { url } }))
        return from(
            this.client.chat.completions.create({
                model: 'ft:gpt-4o-2024-08-06:blue-financial-services-it::ATVIL1Ws',
                messages: [
                    {
                        role: 'system',
                        content: 'Agisci come un OCR per estrarre dei dati dalle 2 foto che riceverai in input: nella prima foto devi trovare i seguenti dati: \'Cognome\', \'Nome\', \'Sesso\', \'Data di nascita\', \'Luogo di nascita\', \'Data emissione\', \'Data di scadenza\', \'Comune di emissione\', \'Numero documento\', \'Cittadinanza\'. Nella seconda foto devi trovare i seguenti dati: \'Codice Fiscale\', \'Indirizzo di residenza\'. Se non trovi un valore, non devi dedurlo ma devi indicare che non è stato possibile recuperarlo.'
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(urls.map((url) => ({ type: 'image_url', image_url: { url } })))/* as ChatCompletionContentPartImage[],*/
                    },
                ],
            })
        );
    }

    // Metodo per codificare immagini in Base64
    encodeImage(file: File): Observable<string> {
        return new Observable<string>((observer) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64String = (reader.result as string).split(',')[1];
                observer.next(`data:image/${file.type.split('/')[1]};base64,${base64String}`);
                observer.complete();
            };
            reader.onerror = (error) => observer.error(error);
            reader.readAsDataURL(file);
        });
    }
}
