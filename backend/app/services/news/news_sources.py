import feedparser
import httpx
import pandas as pd
from bs4 import BeautifulSoup
import json
import re
import spacy

class News_Source:
    _EXPLICIT_TICKER_PATTERNS = (
        re.compile(r"(?<![\w$])\$(?P<ticker>[A-Z][A-Z0-9.-]{0,9})\b"),
        re.compile(r"\b(?:NASDAQ|NYSE|AMEX|ARCA|OTC|TSX):(?P<ticker>[A-Z][A-Z0-9.-]{0,9})\b"),
        re.compile(r"(?<![A-Z0-9])\((?P<ticker>[A-Z][A-Z0-9.-]{0,9})\)(?![A-Z0-9])"),
    )

    def __init__(self, feed_url: str, source_name: str = "General"):
        self.feed_url = feed_url
        self.source_name = source_name
        column_names = ['title', 'link', 'pub_year', 'pub_month', 'pub_day', 'guid', 'authors', 'source']
        self.df = pd.DataFrame(columns=column_names)
        self.add_from_feed(feed_url)
        News_Source.stock_map = None

    def add_from_feed(self, feed_url: str):
        d = feedparser.parse(feed_url)
        leng = len(d['entries'])
        for i in range(0, leng, 1):
            val = d['entries'][i].get('published_parsed')
            guid = d['entries'][i].get('guid')
            authors = d['entries'][i].get('authors')

            if authors is None:
                arr = None
            else:
                leng2 = len(authors)
                arr = []
                for j in range(0, leng2):
                    arr.insert(0, authors[j]['name'])
            new_row = [
                {
                    'title': d['entries'][i]['title'],
                    'link': d['entries'][i]['link'],
                    'pub_year': val[0] if val is not None else None,
                    'pub_month': val[1] if val is not None else None,
                    'pub_day': val[2] if val is not None else None,
                    'guid': guid,
                    'authors': arr,
                    'source': self.source_name
                }
            ]
            self.df = pd.concat([self.df, pd.DataFrame(new_row)], ignore_index=True)

    async def add_article_body_df(self, format_text: bool = False): # decorator function to add a column for article body text to the dataframe saves time as adding article body text is expensive
        if 'body' not in self.df.columns:
            self.df['body'] = None
            for i in range(len(self.df)):
                article_body = await self.get_article_body(i)
                self.df.loc[i, 'body'] = self.format_article_text(article_body) if format_text else article_body
    
    async def add_stock_tickers_df(self): # decorator function to add a column for stock tickers using NLP on each article body text in the dataframe
        if 'stock_tickers' not in self.df.columns:
            await self.add_article_body_df() # Ensure article body text is added before attempting to get stock tickers
            self.df['stock_tickers'] = None
            for i in range(len(self.df)):
                article_text = self.df.loc[i, 'body']
                stock_tickers = await self.nlp_get_stock_tickers(article_text) if article_text is not None else None
                self.df.at[i, 'stock_tickers'] = stock_tickers

    def reduce_random(self, n: int, seed: int): # helper function to reduce the dataframe to n random entries for testing purposes
        if n < len(self.df):
            self.df = self.df.sample(n, random_state=seed).reset_index(drop=True)

    def format_article_text(self, text: str) -> str: # helper function to format article body text for long entries
        if text is None:
            text = "No body text available."
        elif len(text) > 300:
            return text[0:297] + "..."

        return text

    def get_feed_json(self):
        d = feedparser.parse(self.feed_url)
        pretty_json = json.dumps(d['entries'], indent=4)
        return pretty_json
    
    def get_article_link(self, index: int) -> str:
        if index > len(self.df)-1 or index < 0:
            return None
        else:
            return self.df['link'][index]
        
    
    async def get_article_body(self, index: int) -> str: #Default method returns raw html 
        if index > len(self.df)-1 or index < 0:
            return None
        else:
            return await self.get_article_body_link(self.df['link'][index])
    
    @staticmethod
    async def get_article_html(article_link: str) -> str:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                            "(KHTML, like Gecko) Chrome/121.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.google.com/"
        }
        async with httpx.AsyncClient(headers=headers, verify=False, timeout=10.0) as client: #TODO: Change verify to use actual SSL certificates at some point
            html = await client.get(article_link)
        return html

    @staticmethod
    async def get_article_body_link(article_link: str) -> str: #Default method returns raw html 
        html = await News_Source.get_article_html(article_link)
        soup = BeautifulSoup(html.text, features='html.parser')
        return soup
    
    @staticmethod
    async def get_stock_map(): # Decortator function to get stock map for use in nlp sentiment analysis lies dormant until stock sentimenent analysis is needed
        async with httpx.AsyncClient(verify=False) as client: #TODO: Change verify to use actual SSL certificates at some point
            response = await client.get("https://raw.githubusercontent.com/ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos/refs/heads/main/without_logo.min.json")
        News_Source.stock_map = response.json()
    
    @staticmethod
    async def nlp_get_stock_tickers(article_text: str) -> list:
        if News_Source.stock_map is None:
            await News_Source.get_stock_map()
        nlp = spacy.load("en_core_web_sm")
        
        doc = nlp(article_text)

        blacklist = [
            "AI",
            "InvestingPro",
            "InvestingPro Tips",
            "Overvalued"
        ]

        companies = []
        tickers = []
        for ent in doc.ents:
            if ent.label_ == "ORG":
                if ent.text not in blacklist:
                    companies.append(ent.text)
        print(companies)
        for company in companies:
            for stock in News_Source.stock_map:
                if company in stock["name"]:
                    symbol = stock["symbol"]
                    if symbol not in tickers:
                        tickers.append(symbol)
                    
        return tickers

class News_Source_NBC(News_Source):
    
    def __init__(self, feed_url: str):
        super().__init__(feed_url=feed_url, source_name="NBC")
    
    @staticmethod
    async def get_article_body_link(article_link: str) -> str:
        html = await News_Source.get_article_html(article_link)
        soup = BeautifulSoup(html.text, features='html.parser')
        article_json = soup.find("script", type="application/ld+json")
        article_body = json.loads(article_json.string).get('articleBody')
        if article_body is None:
            article_body = "Video Content, no article body text available."
        return article_body
    
class News_Source_ABC(News_Source):
    
    def __init__(self, feed_url: str):
        super().__init__(feed_url=feed_url, source_name="ABC")
    
    @staticmethod
    async def get_article_body_link(article_link: str) -> str:
        html = await News_Source.get_article_html(article_link)
        soup = BeautifulSoup(html.text, features='html.parser')
        if soup is not None:
            article_p_tags = soup.find_all("p")
            article_text = ""
            for p_tag in article_p_tags:
                # Use .get_text() or .text to get only the text content, stripping other HTML tags
                article_text = article_text + p_tag.get_text() + " "
                article_text = article_text.strip()
        else:
            article_text = "No body text available."
        return article_text

class News_Source_invescom(News_Source):
    
    def __init__(self, feed_url: str):
        super().__init__(feed_url=feed_url, source_name="INVESCOM")
    
    @staticmethod
    async def get_article_body_link(article_link: str) -> str:
        html = await News_Source.get_article_html(article_link)
        soup = BeautifulSoup(html.text, features='html.parser')
        found_art = soup.find("div", id='article')
        if found_art is not None:
            article_p_tags = found_art.find_all("p")
            article_text = ""
            for p_tag in article_p_tags:
                # Use .get_text() or .text to get only the text content, stripping other HTML tags
                article_text = article_text + p_tag.get_text() + " "
        else:
            article_text = "No body text available."
        return article_text.strip()
