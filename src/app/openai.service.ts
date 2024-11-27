import { Injectable } from '@angular/core';
import { BehaviorSubject, forkJoin, from, Observable, tap } from 'rxjs';
import OpenAI from 'openai';
import { environment } from '../environment';


@Injectable({
    providedIn: 'root',
})
export class OpenAIService {
    private client = new OpenAI({apiKey: environment.openai_apikey, dangerouslyAllowBrowser: true});
    private messages: any[] = [
        {
            role: 'system',
            content: 'Riceverai una o più immagini, analizza il contenuto delle immagini e indica se rappresentano una carta di identità elettronica o una patente, quindi chiama la funzione adatta per estrarne i dati e presentali elegantemente.' +
                'Se ricevi tanti documenti, devi effettuare tante chiamate alle funzioni di estrazioni quanti sono i documenti ricevuti. Per esempio, se ricevi 2 coppie di foto fronte e retro di 2 carte di identità elettroniche,' +
                'dovrai chiamare 2 volte la funzione di estrazione assegnando correttamente gli input, quindi la prima chiamata riceverà la prima coppia di foto e la seconda chiamata riceverà la seconda coppia.' +
                'Potresti anche ricevere patenti e carte di identità assieme, anche in questo caso assegna correttamente gli input a ciascuna chiamata di funzione.'
        },
    ];
    private tools: any[] = [
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
    sendMessageResponse: BehaviorSubject<string | null> = new BehaviorSubject<string | null>('')
    private functionsMap: Record<string, Function> = {
        'estrazioneDatiPatente': this.estrazioneDatiPatente.bind(this),
        'estrazioneDatiCartaDiIdentitaElettronica': this.estrazioneDatiCartaDiIdentitaElettronica.bind(this)
    }
    constructor() {
    }

    estrazioneDatiPatente(base64images: string[]) {
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
                        content: base64images.map((url) => ({ type: 'image_url', image_url: { url } }))/* as ChatCompletionContentPartImage[],*/
                    },
                ],
            })
        );
    }

    estrazioneDatiCartaDiIdentitaElettronica(base64images: string[]) {
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
                        content: base64images.map((url) => ({ type: 'image_url', image_url: { url } }))
                    },
                ],
            })
        );
    }

    // Metodo per inviare messaggi e immagini
    sendMessage(userInput: string, imagesInputHistory: any, imagesInputContent?: any) {
        if (!!imagesInputContent)
            this.messages.push(imagesInputContent)
        this.messages.push({role: 'user', content: userInput})
        from(
            this.client.chat.completions.create({
                model: 'gpt-4o-2024-08-06',
                messages: this.messages,
                tools: this.tools
            })
        ).subscribe((res) => {
            const response = res.choices[0].message
            this.messages.push(response)
            if (response.tool_calls) {
                // Gestisci tutte le chiamate ai tool
                const toolCalls = response.tool_calls;

                forkJoin(
                    toolCalls.map((toolCall) => {
                        // Decodifica gli argomenti dalla chiamata
                        const argumentss = JSON.parse(toolCall.function.arguments);
                        const paths = argumentss['paths'] || [];

                        // Esegui la funzione appropriata
                        if (this.functionsMap[toolCall.function.name]) {
                            return this.functionsMap[toolCall.function.name](paths.map((path: string) => imagesInputHistory[path])).pipe(
                                tap((toolResponse: any) => {
                                    // Aggiungi il risultato al contesto come tool
                                    const functionResultMessage = {
                                        role: 'tool',
                                        content: toolResponse.choices[0].message.content,
                                        tool_call_id: toolCall.id,
                                    };
                                    this.messages.push(functionResultMessage);
                                })
                            );
                        } else {
                            console.warn('Tool non supportato:', toolCall.function.name);
                            return [];
                        }
                    })
                ).subscribe({
                    next: () => {
                        // Dopo aver gestito tutte le chiamate ai tool, invia il contesto aggiornato al modello
                        from(
                            this.client.chat.completions.create({
                                model: 'gpt-4o-2024-08-06',
                                messages: this.messages,
                            })
                        ).subscribe((completion) => {
                            this.sendMessageResponse.next(completion.choices[0].message.content);
                            this.messages.push(completion.choices[0].message);
                        })
                    },
                    error: (err) => console.error('Errore nella gestione delle tool_calls:', err),
                });
            } else {
                this.sendMessageResponse.next(res.choices[0].message.content)
            }
        })
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
