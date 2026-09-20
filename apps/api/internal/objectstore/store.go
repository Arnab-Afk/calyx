package objectstore

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type Store interface {
	Put(ctx context.Context, key, contentType string, data []byte) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
}

type S3Store struct {
	client *s3.Client
	bucket string
}

type Config struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	UsePathStyle    bool
}

func NewS3(ctx context.Context, cfg Config) (*S3Store, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID, cfg.SecretAccessKey, "",
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("load object storage config: %w", err)
	}
	client := s3.NewFromConfig(awsCfg, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(cfg.Endpoint)
		options.UsePathStyle = cfg.UsePathStyle
	})
	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := client.HeadBucket(checkCtx, &s3.HeadBucketInput{Bucket: aws.String(cfg.Bucket)}); err != nil {
		return nil, fmt.Errorf("verify object storage bucket: %w", err)
	}
	return &S3Store{client: client, bucket: cfg.Bucket}, nil
}

func (s *S3Store) Put(ctx context.Context, key, contentType string, data []byte) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket), Key: aws.String(key),
		Body: bytes.NewReader(data), ContentType: aws.String(contentType),
		ContentLength: aws.Int64(int64(len(data))),
	})
	if err != nil {
		return fmt.Errorf("put object: %w", err)
	}
	return nil
}

func (s *S3Store) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket), Key: aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}
	return result.Body, nil
}

func (s *S3Store) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket), Key: aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}
