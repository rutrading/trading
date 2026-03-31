import feedparser
import pandas as pd
import requests
from bs4 import BeautifulSoup
import json

class News_Source:

    def __init__(self, feed_url: str, source_name: str = "General"):
        self.feed_url = feed_url
        self.source_name = source_name
        column_names = ['title', 'link', 'pub_year', 'pub_month', 'pub_day', 'guid', 'authors', 'source']
        self.df = pd.DataFrame(columns=column_names)
        self.add_from_feed(feed_url)

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

    def add_article_body_df(self): # decorator function to add a column for article body text to the dataframe saves time as adding article body text is expensive
        self.df['body'] = None
        for i in range(0, len(self.df), 1):
            article_body = self.get_article_body(i)
            self.df.loc[i, 'body'] = self.format_article_text(article_body)
    
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
        
    
    def get_article_body(self, index: int) -> str: #Default method returns raw html 
        if index > len(self.df)-1 or index < 0:
            return None
        else:
            return self.get_article_body_link(self.df['link'][index])
    
    def get_article_body_link(self, article_link: str) -> str: #Default method returns raw html 
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                            "(KHTML, like Gecko) Chrome/121.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.google.com/"
        }
        session = requests.Session()
        html = session.get(article_link, headers=headers)
        soup = BeautifulSoup(html.text, features='html.parser')
        return soup

class News_Source_NBC(News_Source):
    
    def __init__(self, feed_url: str):
        super().__init__(feed_url=feed_url, source_name="NBC")
        
    def get_article_body_link(self, article_link: str) -> str:
        html = requests.get(article_link)
        soup = BeautifulSoup(html.text, features='html.parser')
        article_json = soup.find("script", type="application/ld+json")
        article_body = json.loads(article_json.string).get('articleBody')
        if article_body is None:
            article_body = "Video Content, no article body text available."
        return article_body
    
class News_Source_ABC(News_Source):
    
    def __init__(self, feed_url: str):
        super().__init__(feed_url=feed_url, source_name="ABC")
    
    def get_article_body_link(self, article_link: str) -> str:
        html = requests.get(article_link)
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
    
    def get_article_body_link(self, article_link: str) -> str:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                            "(KHTML, like Gecko) Chrome/121.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.google.com/"
        }
        session = requests.Session()
        html = session.get(article_link, headers=headers)
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